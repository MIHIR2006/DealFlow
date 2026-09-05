package dto

// QuotationSummary is one row of the pipeline list. Its figures come from
// stored columns, so a list of two thousand deals costs one query and no
// engine runs.
type QuotationSummary struct {
	ID               int64  `json:"id"`
	Reference        string `json:"reference"`
	Status           string `json:"status"`
	CustomerID       int64  `json:"customer_id"`
	CustomerName     string `json:"customer_name"`
	CustomerTier     string `json:"customer_tier"`
	RepName          string `json:"rep_name"`
	LineCount        int64  `json:"line_count"`
	NetSubtotal      string `json:"net_subtotal"`
	GrandTotal       string `json:"grand_total"`
	MarginPct        string `json:"margin_pct"`
	BlendedRiskScore string `json:"blended_risk_score"`
	RequiredLevel    string `json:"required_level"`
	LastActivityAt   string `json:"last_activity_at"`
}

// QuotationLine is one row of the builder's cart.
type QuotationLine struct {
	ID           int64  `json:"id"`
	Position     int32  `json:"position"`
	ProductID    int64  `json:"product_id"`
	ProductName  string `json:"product_name"`
	SKU          string `json:"sku"`
	CategoryID   int64  `json:"category_id"`
	CategoryName string `json:"category_name"`

	Qty             string `json:"qty"`
	UnitPrice       string `json:"unit_price"`
	LineDiscountPct string `json:"line_discount_pct"`
	TaxRatePct      string `json:"tax_rate_pct"`

	// EffectiveDiscountPct is the line discount composed with the order
	// discount. This, not LineDiscountPct, is what governance scores.
	EffectiveDiscountPct string `json:"effective_discount_pct"`

	ListValue      string `json:"list_value"`
	DiscountAmount string `json:"discount_amount"`
	NetAmount      string `json:"net_amount"`
	TaxAmount      string `json:"tax_amount"`
	MarginAmount   string `json:"margin_amount"`
	MarginPct      string `json:"margin_pct"`

	LineType   string  `json:"line_type"`
	PlanID     *int64  `json:"plan_id,omitempty"`
	PlanName   *string `json:"plan_name,omitempty"`
	PlanPeriod *string `json:"plan_period,omitempty"`
}

// QuotationTotals is the order rollup. One-time and recurring are split so
// the billing screen can show the two tracks side by side.
type QuotationTotals struct {
	ListSubtotal   string `json:"list_subtotal"`
	DiscountTotal  string `json:"discount_total"`
	NetSubtotal    string `json:"net_subtotal"`
	TaxTotal       string `json:"tax_total"`
	GrandTotal     string `json:"grand_total"`
	MarginAmount   string `json:"margin_amount"`
	MarginPct      string `json:"margin_pct"`
	OneTimeTotal   string `json:"one_time_total"`
	RecurringTotal string `json:"recurring_total"`
}

// RiskLine is one row of the "Why This Quote Was Flagged" table.
type RiskLine struct {
	LineID       int64  `json:"line_id"`
	ProductName  string `json:"product_name"`
	CategoryName string `json:"category_name"`
	GivenPct     string `json:"given_pct"`
	AllowedPct   string `json:"allowed_pct"`
	OveragePts   string `json:"overage_pts"`
	ListValue    string `json:"list_value"`
	IsOver       bool   `json:"is_over"`
}

// RiskVerdict is the governance decision and the reasoning behind it.
//
// Score and breakdown come from a single engine call, so the number and the
// table explaining it can never disagree.
type RiskVerdict struct {
	BlendedScore   string     `json:"blended_score"`
	MaxLineOverage string     `json:"max_line_overage"`
	RequiredLevel  string     `json:"required_level"`
	Rationale      string     `json:"rationale"`
	Breakdown      []RiskLine `json:"breakdown"`

	// ConfigVersion identifies the governance snapshot that produced this
	// verdict, so an approval can be explained after the rules have moved on.
	ConfigVersion int64 `json:"config_version"`
}

// ApprovalStep is one step of the chain. Superseded rounds are included:
// the trail must show submitted, returned, and resubmitted together.
type ApprovalStep struct {
	ID           int64   `json:"id"`
	Round        int32   `json:"round"`
	Step         int32   `json:"step"`
	RequiredRole string  `json:"required_role"`
	Status       string  `json:"status"`
	ActorName    *string `json:"actor_name,omitempty"`
	Reason       string  `json:"reason"`
	DecidedAt    *string `json:"decided_at,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

// AuditEntry is one line of the trail.
type AuditEntry struct {
	ID         int64  `json:"id"`
	Action     string `json:"action"`
	ActorLabel string `json:"actor_label"`
	Note       string `json:"note"`
	CreatedAt  string `json:"created_at"`
}

// Quotation is the full builder payload. Every pricing mutation returns this
// whole document, so the client never recomputes money and cannot disagree
// with the server about a total.
type Quotation struct {
	ID               int64  `json:"id"`
	Reference        string `json:"reference"`
	Status           string `json:"status"`
	Version          int32  `json:"version"`
	CustomerID       int64  `json:"customer_id"`
	CustomerName     string `json:"customer_name"`
	CustomerTier     string `json:"customer_tier"`
	RepName          string `json:"rep_name"`
	OrderDiscountPct string `json:"order_discount_pct"`

	Lines  []QuotationLine `json:"lines"`
	Totals QuotationTotals `json:"totals"`
	Risk   RiskVerdict     `json:"risk"`

	Approvals []ApprovalStep `json:"approvals,omitempty"`
	Audit     []AuditEntry   `json:"audit,omitempty"`

	LastActivityAt string `json:"last_activity_at"`
}

// CreateQuotationRequest opens a draft.
type CreateQuotationRequest struct {
	CustomerID int64 `json:"customer_id" binding:"required,gt=0"`
}

// AddLineRequest appends a product to the cart.
type AddLineRequest struct {
	ProductID   int64  `json:"product_id"   binding:"required,gt=0"`
	Qty         string `json:"qty"          binding:"required"`
	DiscountPct string `json:"discount_pct"`
	PlanID      *int64 `json:"plan_id"`
}

// UpdateLineRequest changes a line's quantity or discount.
type UpdateLineRequest struct {
	Qty         string `json:"qty"          binding:"required"`
	DiscountPct string `json:"discount_pct"`
}

// SetOrderDiscountRequest applies a discount across the order. It composes
// with each line's own discount rather than replacing it.
type SetOrderDiscountRequest struct {
	OrderDiscountPct string `json:"order_discount_pct" binding:"required"`
}
