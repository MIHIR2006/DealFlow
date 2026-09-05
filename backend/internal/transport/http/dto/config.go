package dto

// Money and percentages cross the wire as decimal strings, never as JSON
// numbers. A JSON number is a float64 on the far side, and 0.1 + 0.2 is not
// 0.3 there either. The frontend parses these with a decimal library.

// Category is a product grouping.
type Category struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// CreateCategoryRequest adds a category.
type CreateCategoryRequest struct {
	Name string `json:"name" binding:"required"`
}

// Product is a catalogue entry.
type Product struct {
	ID             int64  `json:"id"`
	CategoryID     int64  `json:"category_id"`
	CategoryName   string `json:"category_name,omitempty"`
	SKU            string `json:"sku"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Unit           string `json:"unit"`
	UnitPrice      string `json:"unit_price"`
	UnitCost       string `json:"unit_cost"`
	TaxRatePct     string `json:"tax_rate_pct"`
	IsPromoted     bool   `json:"is_promoted"`
	IsSubscription bool   `json:"is_subscription"`
	IsActive       bool   `json:"is_active"`
}

// ProductRequest creates or replaces a catalogue entry.
type ProductRequest struct {
	CategoryID     int64  `json:"category_id"  binding:"required,gt=0"`
	SKU            string `json:"sku"          binding:"required"`
	Name           string `json:"name"         binding:"required"`
	Description    string `json:"description"`
	Unit           string `json:"unit"`
	UnitPrice      string `json:"unit_price"   binding:"required"`
	UnitCost       string `json:"unit_cost"    binding:"required"`
	TaxRatePct     string `json:"tax_rate_pct"`
	IsPromoted     bool   `json:"is_promoted"`
	IsSubscription bool   `json:"is_subscription"`
	IsActive       bool   `json:"is_active"`
}

// DiscountTier is a customer tier's base discount ceiling.
type DiscountTier struct {
	Tier           string `json:"tier"`
	MaxDiscountPct string `json:"max_discount_pct"`
}

// SetDiscountTierRequest sets a tier's ceiling.
type SetDiscountTierRequest struct {
	MaxDiscountPct string `json:"max_discount_pct" binding:"required"`
}

// CategoryCeiling is a category's discount limit.
type CategoryCeiling struct {
	CategoryID     int64  `json:"category_id"`
	CategoryName   string `json:"category_name"`
	MaxDiscountPct string `json:"max_discount_pct"`
}

// SetCategoryCeilingRequest sets a category's limit.
type SetCategoryCeilingRequest struct {
	MaxDiscountPct string `json:"max_discount_pct" binding:"required"`
}

// ApprovalPolicy is a routing rule. A quotation matches when either threshold
// is met, so the blended score and the worst single line act independently.
type ApprovalPolicy struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	MinBlended      string `json:"min_blended"`
	MinLineOverage  string `json:"min_line_overage"`
	RequiresManager bool   `json:"requires_manager"`
	RequiresFinance bool   `json:"requires_finance"`
	IsActive        bool   `json:"is_active"`
}

// ApprovalPolicyRequest creates or replaces a routing rule.
type ApprovalPolicyRequest struct {
	Name            string `json:"name"             binding:"required"`
	MinBlended      string `json:"min_blended"`
	MinLineOverage  string `json:"min_line_overage"`
	RequiresManager bool   `json:"requires_manager"`
	RequiresFinance bool   `json:"requires_finance"`
	IsActive        bool   `json:"is_active"`
}

// Warehouse is a shipping origin.
type Warehouse struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	ShippingCostWeight string `json:"shipping_cost_weight"`
	IsActive           bool   `json:"is_active"`
}

// CreateWarehouseRequest adds a shipping origin.
type CreateWarehouseRequest struct {
	Name               string `json:"name" binding:"required"`
	ShippingCostWeight string `json:"shipping_cost_weight"`
}

// StockItem is availability of a product at a warehouse.
type StockItem struct {
	WarehouseID int64 `json:"warehouse_id"`
	ProductID   int64 `json:"product_id"`
	OnHand      int64 `json:"on_hand"`
	Reserved    int64 `json:"reserved"`
	Available   int64 `json:"available"`
}

// SetStockRequest sets an absolute on-hand quantity.
type SetStockRequest struct {
	ProductID int64 `json:"product_id" binding:"required,gt=0"`
	OnHand    int64 `json:"on_hand"    binding:"gte=0"`
}

// AddStockRequest increases on-hand quantity, which is what makes an open
// backorder consolidatable.
type AddStockRequest struct {
	ProductID int64 `json:"product_id" binding:"required,gt=0"`
	Qty       int64 `json:"qty"        binding:"required,gt=0"`
}

// SubscriptionPlan is a recurring billing cadence.
type SubscriptionPlan struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Period   string `json:"period"`
	Cycles   int32  `json:"cycles"`
	IsActive bool   `json:"is_active"`
}

// CreateSubscriptionPlanRequest adds a recurring plan.
type CreateSubscriptionPlanRequest struct {
	Name   string `json:"name"   binding:"required"`
	Period string `json:"period" binding:"required,oneof=MONTHLY QUARTERLY YEARLY"`
	Cycles int32  `json:"cycles" binding:"required,gt=0"`
}

// UpsellRule pairs a product with something to suggest alongside it.
type UpsellRule struct {
	ID                 int64  `json:"id"`
	ProductID          int64  `json:"product_id"`
	SuggestedProductID int64  `json:"suggested_product_id"`
	Score              string `json:"score"`
	MinMarginPct       string `json:"min_margin_pct"`
	IsActive           bool   `json:"is_active"`
}

// CreateUpsellRuleRequest adds a pairing.
type CreateUpsellRuleRequest struct {
	ProductID          int64  `json:"product_id"           binding:"required,gt=0"`
	SuggestedProductID int64  `json:"suggested_product_id" binding:"required,gt=0"`
	Score              string `json:"score"`
	MinMarginPct       string `json:"min_margin_pct"`
}

// GovernanceSnapshot is the configuration the risk engine is currently using.
//
// It is exposed so an approval screen can state which version of the rules
// produced a verdict, and so a demo can show that editing a ceiling really
// does change what the engine reads.
type GovernanceSnapshot struct {
	Version  int64             `json:"version"`
	LoadedAt string            `json:"loaded_at"`
	Tiers    []DiscountTier    `json:"tiers"`
	Ceilings []CategoryCeiling `json:"category_ceilings"`
	Policies []ApprovalPolicy  `json:"policies"`
}
