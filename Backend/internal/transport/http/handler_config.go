package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/billing"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
)

type configHandler struct {
	svc *service.ConfigService
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

func (h configHandler) listCustomers(c *gin.Context) {
	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}
	limit := pageLimit(c)

	rows, err := h.svc.ListCustomers(c.Request.Context(), cursor, limit+1)
	if err != nil {
		Fail(c, err)
		return
	}

	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.Customer, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Customer{
			ID: r.ID, Name: r.Name, Email: r.Email, Tier: r.Tier, IsActive: r.IsActive,
		})
	}
	OK(c, http.StatusOK, Page[dto.Customer]{Data: out, NextCursor: next})
}

func (h configHandler) createCustomer(c *gin.Context) {
	var req dto.CreateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	row, err := h.svc.CreateCustomer(c.Request.Context(), req.Name, req.Email, req.Tier)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, dto.Customer{
		ID: row.ID, Name: row.Name, Email: row.Email, Tier: row.Tier, IsActive: row.IsActive,
	})
}

// ---------------------------------------------------------------------------
// Categories and products
// ---------------------------------------------------------------------------

func (h configHandler) listCategories(c *gin.Context) {
	rows, err := h.svc.ListCategories(c.Request.Context())
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.Category, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Category{ID: r.ID, Name: r.Name})
	}
	OK(c, http.StatusOK, Page[dto.Category]{Data: out})
}

func (h configHandler) createCategory(c *gin.Context) {
	var req dto.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	row, err := h.svc.CreateCategory(c.Request.Context(), req.Name)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, dto.Category{ID: row.ID, Name: row.Name})
}

func (h configHandler) listProducts(c *gin.Context) {
	categoryID, err := optionalInt64Query(c, "category_id")
	if err != nil {
		Fail(c, err)
		return
	}
	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}

	limit := pageLimit(c)
	rows, err := h.svc.ListProducts(c.Request.Context(), categoryID, cursor, limit+1)
	if err != nil {
		Fail(c, err)
		return
	}

	// Fetching one extra row is how the handler knows whether another page
	// exists without a second COUNT query.
	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.Product, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Product{
			ID: r.ID, CategoryID: r.CategoryID, CategoryName: r.CategoryName,
			SKU: r.Sku, Name: r.Name, Description: r.Description, Unit: r.Unit,
			UnitPrice: r.UnitPrice.String(), UnitCost: r.UnitCost.String(),
			TaxRatePct: r.TaxRatePct.String(),
			IsPromoted: r.IsPromoted, IsSubscription: r.IsSubscription, IsActive: r.IsActive,
		})
	}
	OK(c, http.StatusOK, Page[dto.Product]{Data: out, NextCursor: next})
}

func (h configHandler) getProduct(c *gin.Context) {
	id, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

	r, err := h.svc.GetProduct(c.Request.Context(), id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, dto.Product{
		ID: r.ID, CategoryID: r.CategoryID, CategoryName: r.CategoryName,
		SKU: r.Sku, Name: r.Name, Description: r.Description, Unit: r.Unit,
		UnitPrice: r.UnitPrice.String(), UnitCost: r.UnitCost.String(),
		TaxRatePct: r.TaxRatePct.String(),
		IsPromoted: r.IsPromoted, IsSubscription: r.IsSubscription, IsActive: r.IsActive,
	})
}

func (h configHandler) createProduct(c *gin.Context) {
	in, err := bindProduct(c)
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.CreateProduct(c.Request.Context(), in)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, productDTO(row))
}

func (h configHandler) updateProduct(c *gin.Context) {
	id, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}
	in, err := bindProduct(c)
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.UpdateProduct(c.Request.Context(), id, in)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, productDTO(row))
}

func bindProduct(c *gin.Context) (service.ProductInput, error) {
	var req dto.ProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return service.ProductInput{}, bindError(err)
	}

	price, err := parseDecimal(req.UnitPrice, "unit_price")
	if err != nil {
		return service.ProductInput{}, err
	}
	cost, err := parseDecimal(req.UnitCost, "unit_cost")
	if err != nil {
		return service.ProductInput{}, err
	}
	tax, err := parseOptionalDecimal(req.TaxRatePct, "tax_rate_pct")
	if err != nil {
		return service.ProductInput{}, err
	}

	return service.ProductInput{
		CategoryID: req.CategoryID, SKU: req.SKU, Name: req.Name,
		Description: req.Description, Unit: req.Unit,
		UnitPrice: price, UnitCost: cost, TaxRatePct: tax,
		IsPromoted: req.IsPromoted, IsSubscription: req.IsSubscription,
		IsActive: req.IsActive,
	}, nil
}

func productDTO(r sqlcgen.Product) dto.Product {
	return dto.Product{
		ID: r.ID, CategoryID: r.CategoryID,
		SKU: r.Sku, Name: r.Name, Description: r.Description, Unit: r.Unit,
		UnitPrice: r.UnitPrice.String(), UnitCost: r.UnitCost.String(),
		TaxRatePct: r.TaxRatePct.String(),
		IsPromoted: r.IsPromoted, IsSubscription: r.IsSubscription, IsActive: r.IsActive,
	}
}

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

// governance returns the configuration the risk engine is using right now,
// including the cache version that produced it.
func (h configHandler) governance(c *gin.Context) {
	ctx := c.Request.Context()

	tiers, err := h.svc.ListDiscountTiers(ctx)
	if err != nil {
		Fail(c, err)
		return
	}
	ceilings, err := h.svc.ListCategoryCeilings(ctx)
	if err != nil {
		Fail(c, err)
		return
	}
	policies, err := h.svc.ListApprovalPolicies(ctx)
	if err != nil {
		Fail(c, err)
		return
	}

	out := dto.GovernanceSnapshot{
		Tiers:    make([]dto.DiscountTier, 0, len(tiers)),
		Ceilings: make([]dto.CategoryCeiling, 0, len(ceilings)),
		Policies: make([]dto.ApprovalPolicy, 0, len(policies)),
	}
	if snap := h.svc.Snapshot(); snap != nil {
		out.Version = snap.Version
		out.LoadedAt = snap.LoadedAt.UTC().Format("2006-01-02T15:04:05Z")
	}
	for _, t := range tiers {
		out.Tiers = append(out.Tiers, dto.DiscountTier{
			Tier: t.Tier, MaxDiscountPct: t.MaxDiscountPct.String(),
		})
	}
	for _, cc := range ceilings {
		out.Ceilings = append(out.Ceilings, dto.CategoryCeiling{
			CategoryID: cc.CategoryID, CategoryName: cc.CategoryName,
			MaxDiscountPct: cc.MaxDiscountPct.String(),
		})
	}
	for _, p := range policies {
		out.Policies = append(out.Policies, policyDTO(p))
	}

	OK(c, http.StatusOK, out)
}

func (h configHandler) setDiscountTier(c *gin.Context) {
	var req dto.SetDiscountTierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	pct, err := parseDecimal(req.MaxDiscountPct, "max_discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.SetDiscountTier(c.Request.Context(), risk.Tier(c.Param("tier")), pct)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, dto.DiscountTier{
		Tier: row.Tier, MaxDiscountPct: row.MaxDiscountPct.String(),
	})
}

func (h configHandler) setCategoryCeiling(c *gin.Context) {
	categoryID, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.SetCategoryCeilingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	pct, err := parseDecimal(req.MaxDiscountPct, "max_discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.SetCategoryCeiling(c.Request.Context(), categoryID, pct)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, dto.CategoryCeiling{
		CategoryID: row.CategoryID, MaxDiscountPct: row.MaxDiscountPct.String(),
	})
}

func (h configHandler) createPolicy(c *gin.Context) {
	in, err := bindPolicy(c)
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.CreateApprovalPolicy(c.Request.Context(), in)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, policyDTO(row))
}

func (h configHandler) updatePolicy(c *gin.Context) {
	id, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}
	in, err := bindPolicy(c)
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.UpdateApprovalPolicy(c.Request.Context(), id, in)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, policyDTO(row))
}

func bindPolicy(c *gin.Context) (service.PolicyInput, error) {
	var req dto.ApprovalPolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return service.PolicyInput{}, bindError(err)
	}

	blended, err := parseOptionalDecimal(req.MinBlended, "min_blended")
	if err != nil {
		return service.PolicyInput{}, err
	}
	overage, err := parseOptionalDecimal(req.MinLineOverage, "min_line_overage")
	if err != nil {
		return service.PolicyInput{}, err
	}

	return service.PolicyInput{
		Name: req.Name, MinBlended: blended, MinLineOverage: overage,
		RequiresManager: req.RequiresManager, RequiresFinance: req.RequiresFinance,
		IsActive: req.IsActive,
	}, nil
}

func policyDTO(p sqlcgen.ApprovalPolicy) dto.ApprovalPolicy {
	return dto.ApprovalPolicy{
		ID: p.ID, Name: p.Name,
		MinBlended:      p.MinBlended.String(),
		MinLineOverage:  p.MinLineOverage.String(),
		RequiresManager: p.RequiresManager, RequiresFinance: p.RequiresFinance,
		IsActive: p.IsActive,
	}
}

// ---------------------------------------------------------------------------
// Warehouses, stock, plans, upsell rules
// ---------------------------------------------------------------------------

func (h configHandler) listWarehouses(c *gin.Context) {
	rows, err := h.svc.ListWarehouses(c.Request.Context())
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.Warehouse, 0, len(rows))
	for _, r := range rows {
		out = append(out, warehouseDTO(r))
	}
	OK(c, http.StatusOK, Page[dto.Warehouse]{Data: out})
}

func (h configHandler) createWarehouse(c *gin.Context) {
	var req dto.CreateWarehouseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	weight, err := parseOptionalDecimal(req.ShippingCostWeight, "shipping_cost_weight")
	if err != nil {
		Fail(c, err)
		return
	}
	if weight.IsZero() {
		weight = decimal.NewFromInt(1)
	}

	lat, err := parseOptionalNullDecimal(req.Latitude, "latitude")
	if err != nil {
		Fail(c, err)
		return
	}
	lng, err := parseOptionalNullDecimal(req.Longitude, "longitude")
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.CreateWarehouse(c.Request.Context(), req.Name, weight, service.WarehouseLocation{
		City: strings.TrimSpace(req.City), Latitude: lat, Longitude: lng,
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, warehouseDTO(row))
}

// warehouseDTO maps a warehouse, including the optional shipping origin.
func warehouseDTO(r sqlcgen.Warehouse) dto.Warehouse {
	out := dto.Warehouse{
		ID: r.ID, Name: r.Name,
		ShippingCostWeight: r.ShippingCostWeight.String(),
		IsActive:           r.IsActive,
		City:               r.City,
	}
	if r.Latitude.Valid && r.Longitude.Valid {
		lat, lng := r.Latitude.Decimal.String(), r.Longitude.Decimal.String()
		out.Latitude, out.Longitude = &lat, &lng
	}
	return out
}

func (h configHandler) setStock(c *gin.Context) {
	warehouseID, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.SetStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	row, err := h.svc.SetStock(c.Request.Context(), warehouseID, req.ProductID, req.OnHand)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, stockDTO(row))
}

// productStock serves availability for the whole catalogue in one read, so the
// builder does not fan out a request per product.
func (h configHandler) productStock(c *gin.Context) {
	rows, err := h.svc.ProductStock(c.Request.Context())
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.ProductStock, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.ProductStock{
			ProductID:      r.ProductID,
			Available:      r.Available,
			OnHand:         r.OnHand,
			WarehouseCount: r.WarehouseCount,
		})
	}
	OK(c, http.StatusOK, gin.H{"data": out})
}

func (h configHandler) addStock(c *gin.Context) {
	warehouseID, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.AddStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	row, err := h.svc.AddStock(c.Request.Context(), warehouseID, req.ProductID, req.Qty)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, stockDTO(row))
}

func stockDTO(r sqlcgen.StockItem) dto.StockItem {
	return dto.StockItem{
		WarehouseID: r.WarehouseID, ProductID: r.ProductID,
		OnHand: r.OnHand, Reserved: r.Reserved,
		Available: r.OnHand - r.Reserved,
	}
}

func (h configHandler) listPlans(c *gin.Context) {
	rows, err := h.svc.ListSubscriptionPlans(c.Request.Context())
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.SubscriptionPlan, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.SubscriptionPlan{
			ID: r.ID, Name: r.Name, Period: r.Period,
			Cycles: r.Cycles, IsActive: r.IsActive,
		})
	}
	OK(c, http.StatusOK, Page[dto.SubscriptionPlan]{Data: out})
}

func (h configHandler) createPlan(c *gin.Context) {
	var req dto.CreateSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	row, err := h.svc.CreateSubscriptionPlan(
		c.Request.Context(), req.Name, billing.Period(req.Period), req.Cycles)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, dto.SubscriptionPlan{
		ID: row.ID, Name: row.Name, Period: row.Period,
		Cycles: row.Cycles, IsActive: row.IsActive,
	})
}

func (h configHandler) createUpsellRule(c *gin.Context) {
	var req dto.CreateUpsellRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	score, err := parseOptionalDecimal(req.Score, "score")
	if err != nil {
		Fail(c, err)
		return
	}
	minMargin, err := parseOptionalDecimal(req.MinMarginPct, "min_margin_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	row, err := h.svc.CreateUpsellRule(
		c.Request.Context(), req.ProductID, req.SuggestedProductID, score, minMargin)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, dto.UpsellRule{
		ID: row.ID, ProductID: row.ProductID, SuggestedProductID: row.SuggestedProductID,
		Score: row.Score.String(), MinMarginPct: row.MinMarginPct.String(),
		IsActive: row.IsActive,
	})
}

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

// DefaultPageSize and MaxPageSize bound every list endpoint. No request can
// ask for an unbounded result set.
const (
	DefaultPageSize int32 = 25
	MaxPageSize     int32 = 100
)

func pageLimit(c *gin.Context) int32 {
	raw := c.Query("limit")
	if raw == "" {
		return DefaultPageSize
	}

	n, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || n <= 0 {
		return DefaultPageSize
	}
	if int32(n) > MaxPageSize {
		return MaxPageSize
	}
	return int32(n)
}

func pathInt64(c *gin.Context, name string) (int64, error) {
	v, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || v <= 0 {
		return 0, apierr.Validation(name + " must be a positive integer")
	}
	return v, nil
}

func optionalInt64Query(c *gin.Context, name string) (*int64, error) {
	raw := c.Query(name)
	if raw == "" {
		return nil, nil
	}

	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil, apierr.Validation(name + " must be an integer")
	}
	return &v, nil
}

func parseDecimal(raw, field string) (decimal.Decimal, error) {
	v, err := decimal.NewFromString(raw)
	if err != nil {
		return decimal.Zero, apierr.Validation(field + " must be a decimal number")
	}
	return v, nil
}

// parseOptionalNullDecimal parses a value that may legitimately be absent,
// such as a coordinate on a warehouse with no location on file.
func parseOptionalNullDecimal(raw, field string) (decimal.NullDecimal, error) {
	if strings.TrimSpace(raw) == "" {
		return decimal.NullDecimal{}, nil
	}
	v, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil {
		return decimal.NullDecimal{}, apierr.Validation(field + " must be a number")
	}
	return decimal.NullDecimal{Decimal: v, Valid: true}, nil
}

func parseOptionalDecimal(raw, field string) (decimal.Decimal, error) {
	if raw == "" {
		return decimal.Zero, nil
	}
	return parseDecimal(raw, field)
}
