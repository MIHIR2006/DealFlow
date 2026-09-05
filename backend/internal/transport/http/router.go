package http

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/transport/http/middleware"
)

// ReadinessFunc reports whether the service can serve traffic. Phase 2 swaps
// the default in for a real database ping.
type ReadinessFunc func(ctx context.Context) error

// Deps is everything the router needs. Each phase adds a field here rather
// than reaching for a package-level global.
type Deps struct {
	Config config.Config
	Log    *slog.Logger
	Pool   *pgxpool.Pool
	Ready  ReadinessFunc
}

// NewRouter builds the HTTP handler with the global middleware chain and the
// probe endpoints. Feature routes are registered by later phases.
func NewRouter(d Deps) *gin.Engine {
	if d.Config.IsProd() {
		gin.SetMode(gin.ReleaseMode)
	}
	if d.Ready == nil {
		d.Ready = func(context.Context) error { return nil }
	}

	r := gin.New()
	r.RedirectTrailingSlash = false

	// Order matters: an id exists before anything logs, and Recovery wraps
	// everything downstream of it.
	r.Use(
		middleware.RequestID(),
		middleware.Logging(d.Log),
		middleware.Recovery(),
		middleware.CORS(d.Config.CORSOrigins),
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

	api := r.Group("/api/v1")
	registerRoutes(api, d)

	r.NoRoute(func(c *gin.Context) {
		Fail(c, apiNotFound())
	})

	return r
}

// registerRoutes is the single seam every later phase plugs into.
func registerRoutes(rg *gin.RouterGroup, d Deps) {
	_ = d

	rg.GET("/ping", func(c *gin.Context) {
		OK(c, http.StatusOK, gin.H{"pong": true})
	})

	// Phase 3 → auth routes
	// Phase 4 → config/admin routes
	// Phase 5 → quotation routes
	// Phase 6 → approval routes
	// Phase 7 → fulfillment routes
	// Phase 8 → billing + invoicing routes
	// Phase 9 → portal routes (separate group, separate middleware)
	// Phase 10 → analytics routes
}
