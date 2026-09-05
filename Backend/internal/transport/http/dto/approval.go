package dto

<<<<<<< HEAD
// PendingApproval is one row of a reviewer's inbox.
//
// It carries the risk figures alongside the quotation so a manager can triage
// the queue without opening every deal.
type PendingApproval struct {
	ID           int64  `json:"id"`
	QuotationID  int64  `json:"quotation_id"`
	Reference    string `json:"reference"`
=======
// ApprovalInboxRow is one row of a reviewer's pending-approvals inbox. It
// carries the risk figures and customer context so a reviewer can triage
// without opening every deal.
type ApprovalInboxRow struct {
	ID           int64  `json:"id"`
	QuotationID  int64  `json:"quotation_id"`
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	Round        int32  `json:"round"`
	Step         int32  `json:"step"`
	RequiredRole string `json:"required_role"`
	Status       string `json:"status"`
<<<<<<< HEAD

	CustomerName string `json:"customer_name"`
	CustomerTier string `json:"customer_tier"`
	RepName      string `json:"rep_name"`

=======
	CreatedAt    string `json:"created_at"`

	Reference        string `json:"reference"`
	CustomerName     string `json:"customer_name"`
	CustomerTier     string `json:"customer_tier"`
	RepName          string `json:"rep_name"`
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	GrandTotal       string `json:"grand_total"`
	BlendedRiskScore string `json:"blended_risk_score"`
	MaxLineOverage   string `json:"max_line_overage"`
	RequiredLevel    string `json:"required_level"`
<<<<<<< HEAD

	CreatedAt string `json:"created_at"`
}

// DecisionRequest is a reviewer's answer to one step.
//
// Reason is mandatory for RETURNED and REJECTED: a trail of bare refusals
// tells the rep nothing and tells an auditor less. The service enforces it
// rather than the binding tag, because the requirement depends on the
// decision.
type DecisionRequest struct {
=======
}

// ApprovalActionRequest is the optional body of an approve, return, or
// reject request. Approving needs no reason; returning or rejecting does.
type ApprovalActionRequest struct {
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	Reason string `json:"reason"`
}
