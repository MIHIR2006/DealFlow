package http

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/cache"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/middleware"
)

// ReadinessFunc reports whether the service can serve traffic.
type ReadinessFunc func(ctx context.Context) error

// Deps is everything the router needs. Each phase adds a field here rather
// than reaching for a package-level global.
type Deps struct {
	Config config.Config
	Log    *slog.Logger
	Pool   *pgxpool.Pool
	Ready  ReadinessFunc

	// Cache is the governance snapshot the risk engine reads. Passing it in
	// lets main load it once before serving, and lets tests supply one that
	// is already warm.
	Cache *cache.Config
}

// NewRouter builds the HTTP handler: global middleware, probes, and the
// authenticated and portal route trees.
func NewRouter(d Deps) *gin.Engine {
	if d.Config.IsProd() {
		gin.SetMode(gin.ReleaseMode)
	}
	if d.Ready == nil {
		d.Ready = func(context.Context) error { return nil }
	}

	r := gin.New()
	r.RedirectTrailingSlash = false

	// Order matters: an id exists before anything logs, Recovery wraps
	// everything downstream, and DBStats must see the whole handler chain.
	r.Use(
		middleware.RequestID(),
		middleware.Logging(d.Log),
		middleware.Recovery(),
		middleware.CORS(d.Config.CORSOrigins),
		middleware.DBStats(d.Config.ExposeDBStats),
	)

	// Liveness: is the process up? Never touches dependencies, so a database
	// blip cannot cause an orchestrator to kill a healthy pod.
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Readiness: can it serve traffic right now? This one does check deps.
	r.GET("/readyz", func(c *gin.Context) {
		if err := d.Ready(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "unavailable",
				"reason": err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	registerRoutes(r.Group("/api/v1"), d)

	r.NoRoute(func(c *gin.Context) { Fail(c, apiNotFound()) })

	return r
}

// registerRoutes wires the API. Every later phase adds its group here.
func registerRoutes(rg *gin.RouterGroup, d Deps) {
	rg.GET("/ping", func(c *gin.Context) {
		OK(c, http.StatusOK, gin.H{"pong": true})
	})

	// Without a pool there is nothing to serve; the probes above still work,
	// which is what tests of the middleware chain rely on.
	if d.Pool == nil {
		return
	}

	queries := sqlcgen.New(d.Pool)
	signer := auth.NewSigner(d.Config.JWTSecret, d.Config.JWTTTL)

	cfgCache := d.Cache
	if cfgCache == nil {
		cfgCache = cache.New(queries)
	}

	authed := middleware.RequireAuth(signer, Fail)
	staff := middleware.RequireRole(Fail,
		auth.RoleAdmin, auth.RoleManager, auth.RoleFinance, auth.RoleRep)
	adminOnly := middleware.RequireRole(Fail, auth.RoleAdmin)
	// Managers configure discount ceilings and approval chains; that is their
	// job, and it is separate from managing the catalogue or warehouses.
	governanceRole := middleware.RequireRole(Fail, auth.RoleAdmin, auth.RoleManager)

	// Login and signup are rate limited: they are the only unauthenticated
	// endpoints where guessing repeatedly wins something.
	ah := authHandler{svc: service.NewAuthService(queries, signer)}
	authGroup := rg.Group("/auth")
	authGroup.Use(middleware.RateLimit(30, 10, Fail))
	{
		authGroup.POST("/signup", adminSignupGuard(queries, signer), ah.signup)
		authGroup.POST("/login", ah.login)
		authGroup.GET("/me", authed, ah.me)
	}

	// The customer-facing tree. Separate group, separate middleware, and no
	// handler below it ever accepts a quotation id from the request.

	// Administrative configuration. Reads are open to any signed-in staff
	// member because the quotation builder needs the catalogue; writes are
	// restricted by resource.
	ch := configHandler{svc: service.NewConfigService(queries, cfgCache)}
	cfg := rg.Group("", authed)
	{
		cfg.GET("/categories", staff, ch.listCategories)
		cfg.POST("/categories", adminOnly, ch.createCategory)

		cfg.GET("/products", staff, ch.listProducts)
		cfg.GET("/products/:id", staff, ch.getProduct)
		cfg.POST("/products", adminOnly, ch.createProduct)
		cfg.PUT("/products/:id", adminOnly, ch.updateProduct)

		// The rules that decide who approves a discount, and the cache
		// version currently serving them.
		cfg.GET("/governance", staff, ch.governance)
		cfg.PUT("/governance/tiers/:tier", governanceRole, ch.setDiscountTier)
		cfg.PUT("/governance/categories/:id/ceiling", governanceRole, ch.setCategoryCeiling)
		cfg.POST("/governance/policies", governanceRole, ch.createPolicy)
		cfg.PUT("/governance/policies/:id", governanceRole, ch.updatePolicy)

		cfg.GET("/warehouses", staff, ch.listWarehouses)
		cfg.POST("/warehouses", adminOnly, ch.createWarehouse)
		cfg.PUT("/warehouses/:id/stock", adminOnly, ch.setStock)
		cfg.POST("/warehouses/:id/stock", adminOnly, ch.addStock)

		cfg.GET("/subscription-plans", staff, ch.listPlans)
		cfg.POST("/subscription-plans", adminOnly, ch.createPlan)

		cfg.POST("/upsell-rules", adminOnly, ch.createUpsellRule)
	}

	// Quotations. Every pricing mutation returns the whole recalculated
	// document, so the client never recomputes money and cannot disagree
	// with the server about a total.
	quoteSvc := service.NewQuoteService(d.Pool, queries, cfgCache)
	qh := quotationHandler{svc: quoteSvc}
	quotes := rg.Group("/quotations", authed, staff)
	{
		quotes.GET("", qh.list)
		quotes.POST("", qh.create)
		quotes.GET("/:id", qh.get)
		quotes.GET("/:id/upsell", qh.upsell)

		quotes.POST("/:id/lines", qh.addLine)
		quotes.PATCH("/:id/lines/:lineId", qh.updateLine)
		quotes.DELETE("/:id/lines/:lineId", qh.deleteLine)

		quotes.PUT("/:id/order-discount", qh.setOrderDiscount)

		// The rep never chooses an approver: the blended risk score decides
		// whether this needs one and which chain it takes.
		quotes.POST("/:id/submit", qh.submit)
	}

	// The customer-facing tree. Separate group, separate middleware, and no
	// handler below it takes a quotation id: the token names exactly one.
	ph := portalHandler{
		svc: service.NewPortalService(d.Pool, queries, quoteSvc),
		ttl: d.Config.PortalTokenTTL,
	}
	quotes.POST("/:id/send", ph.send)

	portal := rg.Group("/portal/q/:token")
	portal.Use(
		middleware.RateLimit(60, 20, Fail),
		middleware.RequirePortalToken(queries, Fail),
	)
	{
		portal.GET("", ph.show)
		portal.POST("/messages", ph.postMessage)
		portal.POST("/counter-offer", ph.counterOffer)
		portal.POST("/confirm", ph.confirm)
	}

	// The approvals inbox and the three decisions a reviewer can take.
	// Approve and reject are terminal for a step; return sends the quotation
	// back to draft so the rep can revise and resubmit, which the audit trail
	// records alongside the original submission.
	ah2 := approvalHandler{svc: service.NewApprovalService(d.Pool, queries, quoteSvc)}
	approvals := rg.Group("/approvals", authed,
		middleware.RequireRole(Fail, auth.RoleAdmin, auth.RoleManager, auth.RoleFinance))
	{
		approvals.GET("", ah2.inbox)
		approvals.POST("/:id/approve", ah2.approve)
		approvals.POST("/:id/return", ah2.returnForRevision)
		approvals.POST("/:id/reject", ah2.reject)
	}

	// Fulfilment. Suggesting is free and persists nothing; accepting reserves
	// stock inside one transaction over locked rows, so the warehouses the
	// engine chose are the ones the order actually takes from.
	fh := fulfillmentHandler{svc: service.NewFulfillmentService(d.Pool, queries, quoteSvc)}
	quotes.POST("/:id/confirm", fh.confirm)

	orders := rg.Group("/orders", authed, staff)
	{
		orders.GET("/:id", fh.get)
		orders.GET("/:id/fulfillment/suggest", fh.suggest)
		orders.POST("/:id/fulfillment", fh.accept)
		orders.POST("/:id/backorders/consolidate", fh.consolidate)
	}

	// Billing. One order carries two tracks: a single invoice for the
	// one-time lines, and a schedule of future periods for the recurring
	// ones. Money-moving endpoints accept an Idempotency-Key.
	bh := billingHandler{
		svc:  service.NewBillingService(d.Pool, queries, quoteSvc),
		idem: service.NewIdempotency(queries),
	}
	orders.POST("/:id/invoices", bh.generate)
	orders.GET("/:id/billing", bh.getForOrder)
	orders.POST("/:id/subscriptions/:lineId/change", bh.changeSubscription)

	invoices := rg.Group("/invoices", authed, staff)
	{
		invoices.GET("", bh.listInvoices)
		invoices.GET("/:id", bh.getInvoice)
		invoices.POST("/:id/payments", bh.recordPayment)
	}

	// Phase 9 → portal negotiation routes
	// Analytics. Every figure is an aggregate computed in Postgres, so the
	// dashboard costs the same at twenty quotations as at twenty thousand.
	anh := analyticsHandler{svc: service.NewAnalyticsService(d.Pool, queries, d.Config, quoteSvc)}
	quotes.POST("/:id/nudge", anh.nudge)

	analytics := rg.Group("", authed,
		middleware.RequireRole(Fail, auth.RoleAdmin, auth.RoleManager, auth.RoleFinance))
	{
		analytics.GET("/dashboard/deal-health", anh.dealHealth)
		analytics.GET("/dashboard/alerts", anh.alerts)
	}

	// Reports are open to any staff member; the service narrows what each
	// role actually sees.
	rg.GET("/reports", authed, staff, anh.report)

}

// adminSignupGuard keeps account creation open while the platform is being
// set up, then closes it to administrators once the first one exists.
//
// Someone must be able to create the first account against an empty database,
// but an open signup endpoint on a running system would let anyone mint
// themselves a FINANCE role and approve their own discounts.
//
// The authentication is done inline rather than by delegating to RequireAuth:
// that middleware calls c.Next(), which would run the signup handler before
// this guard had finished deciding.
func adminSignupGuard(queries *sqlcgen.Queries, signer *auth.Signer) gin.HandlerFunc {
	return func(c *gin.Context) {
		admins, err := queries.ListUsersByRole(c.Request.Context(), string(auth.RoleAdmin))
		if err != nil {
			Fail(c, err)
			return
		}
		if len(admins) == 0 {
			// Bootstrap: no administrator exists yet.
			c.Next()
			return
		}

		principal, err := middleware.Authenticate(signer, c)
		if err != nil {
			Fail(c, err)
			return
		}
		if principal.Role != auth.RoleAdmin {
			Fail(c, apierr.Forbidden("only an administrator may create accounts"))
			return
		}
		c.Next()
	}
}
