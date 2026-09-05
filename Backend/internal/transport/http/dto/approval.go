package dto

// ApprovalInboxRow is one row of a reviewer's pending-approvals inbox. It
// carries the risk figures and customer context so a reviewer can triage
// without opening every deal.
type ApprovalInboxRow struct {
	ID           int64  `json:"id"`
	QuotationID  int64  `json:"quotation_id"`
	Round        int32  `json:"round"`
	Step         int32  `json:"step"`
	RequiredRole string `json:"required_role"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`

	Reference        string `json:"reference"`
	CustomerName     string `json:"customer_name"`
	CustomerTier     string `json:"customer_tier"`
	RepName          string `json:"rep_name"`
	GrandTotal       string `json:"grand_total"`
	BlendedRiskScore string `json:"blended_risk_score"`
	MaxLineOverage   string `json:"max_line_overage"`
	RequiredLevel    string `json:"required_level"`
}

// ApprovalActionRequest is the optional body of an approve, return, or
// reject request. Approving needs no reason; returning or rejecting does.
type ApprovalActionRequest struct {
	Reason string `json:"reason"`
}
