package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/billing"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/cache"
)

// ConfigService owns the administrative configuration: the catalogue, the
// governance rules that decide who approves a discount, and the warehouses
// the fulfilment engine allocates from.
//
// Every write reloads the governance cache before returning. That is what
// makes a ceiling change take effect on the very next quotation rather than
// at the next deployment, which the problem statement requires: the rules
// must be application logic, not values compiled into the binary.
type ConfigService struct {
	q     *sqlcgen.Queries
	cache *cache.Config
}

// NewConfigService builds the service.
func NewConfigService(q *sqlcgen.Queries, c *cache.Config) *ConfigService {
	return &ConfigService{q: q, cache: c}
}

// Snapshot exposes the current governance configuration to other services.
func (s *ConfigService) Snapshot() *cache.Snapshot { return s.cache.Get() }

// refresh reloads the cache after a configuration write.
//
// A write that succeeds but whose reload fails would leave the process
// scoring against stale rules while the database says otherwise, so the
// caller is told about it rather than the error being swallowed.
func (s *ConfigService) refresh(ctx context.Context) error {
	if err := s.cache.Reload(ctx); err != nil {
		return apierr.Internal(fmt.Errorf("reload configuration cache: %w", err))
	}
	return nil
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// ListCategories returns every product category.
func (s *ConfigService) ListCategories(ctx context.Context) ([]sqlcgen.Category, error) {
	rows, err := s.q.ListCategories(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list categories: %w", err))
	}
	return rows, nil
}

// CreateCategory adds a category.
func (s *ConfigService) CreateCategory(ctx context.Context, name string) (sqlcgen.Category, error) {
	if name == "" {
		return sqlcgen.Category{}, apierr.Validation("name is required")
	}

	row, err := s.q.CreateCategory(ctx, name)
	if err != nil {
		if isUniqueViolation(err) {
			return sqlcgen.Category{}, apierr.Conflict("a category with that name already exists")
		}
		return sqlcgen.Category{}, apierr.Internal(fmt.Errorf("create category: %w", err))
	}
	return row, s.refresh(ctx)
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

// ListCustomers returns a page of active customer accounts, for a rep
// building a quotation to choose from.
func (s *ConfigService) ListCustomers(ctx context.Context, cursor *int64, limit int32) ([]sqlcgen.Customer, error) {
	rows, err := s.q.ListCustomers(ctx, sqlcgen.ListCustomersParams{Cursor: cursor, PageSize: limit})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list customers: %w", err))
	}
	return rows, nil
}

// CreateCustomer onboards a customer account. Reps create these inline while
// building a quotation, so this is not restricted to admins the way catalogue
// and governance writes are.
func (s *ConfigService) CreateCustomer(ctx context.Context, name, email, tier string) (sqlcgen.Customer, error) {
	if name == "" {
		return sqlcgen.Customer{}, apierr.Validation("name is required")
	}
	if email == "" {
		return sqlcgen.Customer{}, apierr.Validation("email is required")
	}
	switch tier {
	case "BRONZE", "SILVER", "GOLD":
	default:
		return sqlcgen.Customer{}, apierr.Validation("tier must be one of BRONZE, SILVER, GOLD")
	}

	row, err := s.q.CreateCustomer(ctx, sqlcgen.CreateCustomerParams{Name: name, Email: email, Tier: tier})
	if err != nil {
		if isUniqueViolation(err) {
			return sqlcgen.Customer{}, apierr.Conflict("a customer with that email already exists")
		}
		return sqlcgen.Customer{}, apierr.Internal(fmt.Errorf("create customer: %w", err))
	}
	return row, nil
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

// ProductInput describes a catalogue entry.
type ProductInput struct {
	CategoryID     int64
	SKU            string
	Name           string
	Description    string
	Unit           string
	UnitPrice      decimal.Decimal
	UnitCost       decimal.Decimal
	TaxRatePct     decimal.Decimal
	IsPromoted     bool
	IsSubscription bool
	IsActive       bool
}

func (in ProductInput) validate() error {
	switch {
	case in.CategoryID == 0:
		return apierr.Validation("category_id is required")
	case in.SKU == "":
		return apierr.Validation("sku is required")
	case in.Name == "":
		return apierr.Validation("name is required")
	case in.UnitPrice.IsNegative():
		return apierr.Validation("unit_price cannot be negative")
	case in.UnitCost.IsNegative():
		return apierr.Validation("unit_cost cannot be negative")
	}

	// Selling below cost is legitimate (a loss leader), but it is worth
	// refusing silently-inverted data entry, which is far more common.
	if in.UnitCost.GreaterThan(in.UnitPrice) && in.UnitPrice.IsZero() {
		return apierr.Validation("unit_price must be set when a cost is given")
	}
	return nil
}

// ListProducts returns a page of the catalogue.
func (s *ConfigService) ListProducts(ctx context.Context, categoryID *int64, cursor *int64, limit int32) ([]sqlcgen.ListProductsRow, error) {
	rows, err := s.q.ListProducts(ctx, sqlcgen.ListProductsParams{
		CategoryID: categoryID,
		Cursor:     cursor,
		PageSize:   limit,
	})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list products: %w", err))
	}
	return rows, nil
}

// GetProduct returns one catalogue entry.
func (s *ConfigService) GetProduct(ctx context.Context, id int64) (sqlcgen.GetProductRow, error) {
	row, err := s.q.GetProduct(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.GetProductRow{}, apierr.NotFound("product not found")
		}
		return sqlcgen.GetProductRow{}, apierr.Internal(fmt.Errorf("get product: %w", err))
	}
	return row, nil
}

// CreateProduct adds a catalogue entry.
func (s *ConfigService) CreateProduct(ctx context.Context, in ProductInput) (sqlcgen.Product, error) {
	if err := in.validate(); err != nil {
		return sqlcgen.Product{}, err
	}
	if in.Unit == "" {
		in.Unit = "unit"
	}

	row, err := s.q.CreateProduct(ctx, sqlcgen.CreateProductParams{
		CategoryID:     in.CategoryID,
		Sku:            in.SKU,
		Name:           in.Name,
		Description:    in.Description,
		Unit:           in.Unit,
		UnitPrice:      in.UnitPrice,
		UnitCost:       in.UnitCost,
		TaxRatePct:     in.TaxRatePct,
		IsPromoted:     in.IsPromoted,
		IsSubscription: in.IsSubscription,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return sqlcgen.Product{}, apierr.Conflict("a product with that SKU already exists")
		}
		if isForeignKeyViolation(err) {
			return sqlcgen.Product{}, apierr.Validation("category_id does not refer to an existing category")
		}
		return sqlcgen.Product{}, apierr.Internal(fmt.Errorf("create product: %w", err))
	}
	return row, nil
}

// UpdateProduct replaces a catalogue entry.
func (s *ConfigService) UpdateProduct(ctx context.Context, id int64, in ProductInput) (sqlcgen.Product, error) {
	if err := in.validate(); err != nil {
		return sqlcgen.Product{}, err
	}
	if in.Unit == "" {
		in.Unit = "unit"
	}

	row, err := s.q.UpdateProduct(ctx, sqlcgen.UpdateProductParams{
		ID:             id,
		CategoryID:     in.CategoryID,
		Name:           in.Name,
		Description:    in.Description,
		Unit:           in.Unit,
		UnitPrice:      in.UnitPrice,
		UnitCost:       in.UnitCost,
		TaxRatePct:     in.TaxRatePct,
		IsPromoted:     in.IsPromoted,
		IsSubscription: in.IsSubscription,
		IsActive:       in.IsActive,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.Product{}, apierr.NotFound("product not found")
		}
		if isForeignKeyViolation(err) {
			return sqlcgen.Product{}, apierr.Validation("category_id does not refer to an existing category")
		}
		return sqlcgen.Product{}, apierr.Internal(fmt.Errorf("update product: %w", err))
	}
	return row, nil
}

// ---------------------------------------------------------------------------
// Governance: tiers, ceilings, policies
// ---------------------------------------------------------------------------

// ListDiscountTiers returns the base ceiling for each customer tier.
func (s *ConfigService) ListDiscountTiers(ctx context.Context) ([]sqlcgen.DiscountTier, error) {
	rows, err := s.q.ListDiscountTiers(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list discount tiers: %w", err))
	}
	return rows, nil
}

// SetDiscountTier sets a tier's ceiling and reloads the cache, so the change
// applies to the next quotation scored anywhere in this process.
func (s *ConfigService) SetDiscountTier(ctx context.Context, tier risk.Tier, pct decimal.Decimal) (sqlcgen.DiscountTier, error) {
	if err := validPercent(pct, "max_discount_pct"); err != nil {
		return sqlcgen.DiscountTier{}, err
	}
	switch tier {
	case risk.TierBronze, risk.TierSilver, risk.TierGold:
	default:
		return sqlcgen.DiscountTier{}, apierr.Validation("tier must be one of BRONZE, SILVER, GOLD")
	}

	row, err := s.q.UpsertDiscountTier(ctx, sqlcgen.UpsertDiscountTierParams{
		Tier: string(tier), MaxDiscountPct: pct,
	})
	if err != nil {
		return sqlcgen.DiscountTier{}, apierr.Internal(fmt.Errorf("upsert discount tier: %w", err))
	}
	return row, s.refresh(ctx)
}

// ListCategoryCeilings returns the per-category discount limits.
func (s *ConfigService) ListCategoryCeilings(ctx context.Context) ([]sqlcgen.ListCategoryCeilingsRow, error) {
	rows, err := s.q.ListCategoryCeilings(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list category ceilings: %w", err))
	}
	return rows, nil
}

// SetCategoryCeiling tightens or relaxes a category's discount limit.
//
// The effective limit on a line is the stricter of this and the customer's
// tier, so raising a category ceiling above the tier has no effect on its
// own. That is deliberate: a thin-margin service should be able to sit below
// what the customer's tier would otherwise allow.
func (s *ConfigService) SetCategoryCeiling(ctx context.Context, categoryID int64, pct decimal.Decimal) (sqlcgen.CategoryCeiling, error) {
	if categoryID == 0 {
		return sqlcgen.CategoryCeiling{}, apierr.Validation("category_id is required")
	}
	if err := validPercent(pct, "max_discount_pct"); err != nil {
		return sqlcgen.CategoryCeiling{}, err
	}

	row, err := s.q.UpsertCategoryCeiling(ctx, sqlcgen.UpsertCategoryCeilingParams{
		CategoryID: categoryID, MaxDiscountPct: pct,
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return sqlcgen.CategoryCeiling{}, apierr.Validation("category_id does not refer to an existing category")
		}
		return sqlcgen.CategoryCeiling{}, apierr.Internal(fmt.Errorf("upsert category ceiling: %w", err))
	}
	return row, s.refresh(ctx)
}

// PolicyInput is an approval routing rule.
type PolicyInput struct {
	Name            string
	MinBlended      decimal.Decimal
	MinLineOverage  decimal.Decimal
	RequiresManager bool
	RequiresFinance bool
	IsActive        bool
}

func (in PolicyInput) validate() error {
	if in.Name == "" {
		return apierr.Validation("name is required")
	}
	if in.MinBlended.IsNegative() || in.MinLineOverage.IsNegative() {
		return apierr.Validation("thresholds cannot be negative")
	}

	// A policy that demands nothing can never route anything, and a policy
	// with both thresholds at zero would match every quotation including
	// fully compliant ones. Either is a misconfiguration worth refusing.
	if !in.RequiresManager && !in.RequiresFinance {
		return apierr.Validation("a policy must require at least one approver")
	}
	if in.MinBlended.IsZero() && in.MinLineOverage.IsZero() {
		return apierr.Validation(
			"at least one threshold must be above zero, or the policy matches every quotation")
	}
	return nil
}

// ListApprovalPolicies returns the active routing rules.
func (s *ConfigService) ListApprovalPolicies(ctx context.Context) ([]sqlcgen.ApprovalPolicy, error) {
	rows, err := s.q.ListApprovalPolicies(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list approval policies: %w", err))
	}
	return rows, nil
}

// CreateApprovalPolicy adds a routing rule.
func (s *ConfigService) CreateApprovalPolicy(ctx context.Context, in PolicyInput) (sqlcgen.ApprovalPolicy, error) {
	if err := in.validate(); err != nil {
		return sqlcgen.ApprovalPolicy{}, err
	}

	row, err := s.q.CreateApprovalPolicy(ctx, sqlcgen.CreateApprovalPolicyParams{
		Name:            in.Name,
		MinBlended:      in.MinBlended,
		MinLineOverage:  in.MinLineOverage,
		RequiresManager: in.RequiresManager,
		RequiresFinance: in.RequiresFinance,
	})
	if err != nil {
		return sqlcgen.ApprovalPolicy{}, apierr.Internal(fmt.Errorf("create approval policy: %w", err))
	}
	return row, s.refresh(ctx)
}

// UpdateApprovalPolicy replaces a routing rule.
func (s *ConfigService) UpdateApprovalPolicy(ctx context.Context, id int64, in PolicyInput) (sqlcgen.ApprovalPolicy, error) {
	if err := in.validate(); err != nil {
		return sqlcgen.ApprovalPolicy{}, err
	}

	row, err := s.q.UpdateApprovalPolicy(ctx, sqlcgen.UpdateApprovalPolicyParams{
		ID:              id,
		Name:            in.Name,
		MinBlended:      in.MinBlended,
		MinLineOverage:  in.MinLineOverage,
		RequiresManager: in.RequiresManager,
		RequiresFinance: in.RequiresFinance,
		IsActive:        in.IsActive,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.ApprovalPolicy{}, apierr.NotFound("approval policy not found")
		}
		return sqlcgen.ApprovalPolicy{}, apierr.Internal(fmt.Errorf("update approval policy: %w", err))
	}
	return row, s.refresh(ctx)
}

// ---------------------------------------------------------------------------
// Warehouses, stock, plans, upsell rules
// ---------------------------------------------------------------------------

// ListWarehouses returns the shipping origins, cheapest first.
func (s *ConfigService) ListWarehouses(ctx context.Context) ([]sqlcgen.Warehouse, error) {
	rows, err := s.q.ListWarehouses(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list warehouses: %w", err))
	}
	return rows, nil
}

// CreateWarehouse adds a shipping origin.
func (s *ConfigService) CreateWarehouse(ctx context.Context, name string, weight decimal.Decimal) (sqlcgen.Warehouse, error) {
	if name == "" {
		return sqlcgen.Warehouse{}, apierr.Validation("name is required")
	}
	if weight.IsNegative() {
		return sqlcgen.Warehouse{}, apierr.Validation("shipping_cost_weight cannot be negative")
	}

	row, err := s.q.CreateWarehouse(ctx, sqlcgen.CreateWarehouseParams{
		Name: name, ShippingCostWeight: weight,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return sqlcgen.Warehouse{}, apierr.Conflict("a warehouse with that name already exists")
		}
		return sqlcgen.Warehouse{}, apierr.Internal(fmt.Errorf("create warehouse: %w", err))
	}
	return row, nil
}

// SetStock sets the on-hand quantity for a product at a warehouse.
func (s *ConfigService) SetStock(ctx context.Context, warehouseID, productID, onHand int64) (sqlcgen.StockItem, error) {
	if onHand < 0 {
		return sqlcgen.StockItem{}, apierr.Validation("on_hand cannot be negative")
	}

	row, err := s.q.UpsertStock(ctx, sqlcgen.UpsertStockParams{
		WarehouseID: warehouseID, ProductID: productID, OnHand: onHand,
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return sqlcgen.StockItem{}, apierr.Validation("warehouse_id or product_id does not exist")
		}
		// The schema forbids reserved exceeding on_hand, so lowering stock
		// below what is already committed to orders is refused here rather
		// than silently overselling.
		if isCheckViolation(err) {
			return sqlcgen.StockItem{}, apierr.Conflict(
				"cannot reduce stock below the quantity already reserved for orders")
		}
		return sqlcgen.StockItem{}, apierr.Internal(fmt.Errorf("upsert stock: %w", err))
	}
	return row, nil
}

// AddStock increases on-hand quantity, which is what makes an open backorder
// consolidatable.
func (s *ConfigService) AddStock(ctx context.Context, warehouseID, productID, qty int64) (sqlcgen.StockItem, error) {
	if qty <= 0 {
		return sqlcgen.StockItem{}, apierr.Validation("qty must be positive")
	}

	row, err := s.q.AddStock(ctx, sqlcgen.AddStockParams{
		WarehouseID: warehouseID, ProductID: productID, Qty: qty,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.StockItem{}, apierr.NotFound(
				"no stock record for that product at that warehouse; set it first")
		}
		return sqlcgen.StockItem{}, apierr.Internal(fmt.Errorf("add stock: %w", err))
	}
	return row, nil
}

// ListSubscriptionPlans returns the recurring billing plans.
func (s *ConfigService) ListSubscriptionPlans(ctx context.Context) ([]sqlcgen.SubscriptionPlan, error) {
	rows, err := s.q.ListSubscriptionPlans(ctx)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list subscription plans: %w", err))
	}
	return rows, nil
}

// CreateSubscriptionPlan adds a recurring billing plan.
func (s *ConfigService) CreateSubscriptionPlan(ctx context.Context, name string, period billing.Period, cycles int32) (sqlcgen.SubscriptionPlan, error) {
	if name == "" {
		return sqlcgen.SubscriptionPlan{}, apierr.Validation("name is required")
	}
	if !period.Valid() {
		return sqlcgen.SubscriptionPlan{}, apierr.Validation("period must be one of MONTHLY, QUARTERLY, YEARLY")
	}
	if cycles <= 0 {
		return sqlcgen.SubscriptionPlan{}, apierr.Validation("cycles must be positive")
	}

	row, err := s.q.CreateSubscriptionPlan(ctx, sqlcgen.CreateSubscriptionPlanParams{
		Name: name, Period: string(period), Cycles: cycles,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return sqlcgen.SubscriptionPlan{}, apierr.Conflict("a plan with that name already exists")
		}
		return sqlcgen.SubscriptionPlan{}, apierr.Internal(fmt.Errorf("create subscription plan: %w", err))
	}
	return row, nil
}

// CreateUpsellRule pairs a product with something to suggest alongside it.
func (s *ConfigService) CreateUpsellRule(ctx context.Context, productID, suggestedID int64, score, minMargin decimal.Decimal) (sqlcgen.UpsellRule, error) {
	if productID == 0 || suggestedID == 0 {
		return sqlcgen.UpsellRule{}, apierr.Validation("product_id and suggested_product_id are required")
	}
	if productID == suggestedID {
		return sqlcgen.UpsellRule{}, apierr.Validation("a product cannot suggest itself")
	}

	row, err := s.q.CreateUpsellRule(ctx, sqlcgen.CreateUpsellRuleParams{
		ProductID:          productID,
		SuggestedProductID: suggestedID,
		Score:              score,
		MinMarginPct:       minMargin,
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return sqlcgen.UpsellRule{}, apierr.Validation("one of the products does not exist")
		}
		return sqlcgen.UpsellRule{}, apierr.Internal(fmt.Errorf("create upsell rule: %w", err))
	}
	return row, nil
}

func validPercent(v decimal.Decimal, field string) error {
	if v.IsNegative() || v.GreaterThan(decimal.NewFromInt(100)) {
		return apierr.Validation(field + " must be between 0 and 100")
	}
	return nil
}
