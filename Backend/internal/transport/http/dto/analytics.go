package dto

// PipelineSummary is the headline figures.
type PipelineSummary struct {
	TotalQuotations  int64  `json:"total_quotations"`
	PipelineValue    string `json:"pipeline_value"`
	WonValue         string `json:"won_value"`
	AvgMarginPct     string `json:"avg_margin_pct"`
	AwaitingApproval int64  `json:"awaiting_approval"`
	AvgRiskScore     string `json:"avg_risk_score"`
}

// StatusCount is how many quotations sit in each state, and what they are
// worth.
type StatusCount struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
	Value  string `json:"value"`
}

// StalledDeal is a quotation nobody has touched.
type StalledDeal struct {
	QuotationID    int64  `json:"quotation_id"`
	Reference      string `json:"reference"`
	Status         string `json:"status"`
	CustomerName   string `json:"customer_name"`
	RepName        string `json:"rep_name"`
	GrandTotal     string `json:"grand_total"`
	DaysInactive   int32  `json:"days_inactive"`
	LastActivityAt string `json:"last_activity_at"`
}

// DiscountAnomaly is a discount out of character for the rep who gave it.
//
// The comparison is against that rep's own history, not a company-wide
// figure: a rep who always discounts at 3% jumping to 12% is a signal even
// though 12% may break no policy at all.
type DiscountAnomaly struct {
	QuotationID  int64  `json:"quotation_id"`
	Reference    string `json:"reference"`
	CustomerName string `json:"customer_name"`
	RepName      string `json:"rep_name"`
	GrandTotal   string `json:"grand_total"`
	DiscountPct  string `json:"discount_pct"`
	BaselinePct  string `json:"baseline_pct"`

	// Ratio is how many times the rep's own baseline this deal represents.
	Ratio string `json:"ratio"`
}

// DeliverySlippage is an order past the date it was promised.
type DeliverySlippage struct {
	OrderID      int64  `json:"order_id"`
	Reference    string `json:"reference"`
	Status       string `json:"status"`
	CustomerName string `json:"customer_name"`
	PromisedDate string `json:"promised_date"`
	DaysLate     int32  `json:"days_late"`
}

// DealHealthThresholds is what the scan looked for, echoed back so the
// dashboard can state its own criteria rather than implying them.
type DealHealthThresholds struct {
	StallDays         int32  `json:"stall_days"`
	AnomalyMultiplier string `json:"anomaly_multiplier"`
	AnomalyMinSample  int32  `json:"anomaly_min_sample"`
}

// DealHealth is the dashboard.
type DealHealth struct {
	Summary    PipelineSummary      `json:"summary"`
	Statuses   []StatusCount        `json:"statuses"`
	Stalled    []StalledDeal        `json:"stalled"`
	Anomalies  []DiscountAnomaly    `json:"discount_anomalies"`
	Slippage   []DeliverySlippage   `json:"delivery_slippage"`
	Thresholds DealHealthThresholds `json:"thresholds"`
}

// DealAlert is a recorded alert still open.
type DealAlert struct {
	ID           int64  `json:"id"`
	QuotationID  int64  `json:"quotation_id"`
	Reference    string `json:"reference"`
	CustomerName string `json:"customer_name"`
	AlertType    string `json:"alert_type"`
	Severity     string `json:"severity"`
	Detail       string `json:"detail"`
	Metric       string `json:"metric"`
	CreatedAt    string `json:"created_at"`
}

// NudgeRequest chases a stalled deal.
type NudgeRequest struct {
	Note string `json:"note"`
}

// ReportRow is performance for one rep, team and category.
type ReportRow struct {
	RepName        string `json:"rep_name"`
	SalesTeam      string `json:"sales_team"`
	CategoryName   string `json:"category_name"`
	QuotationCount int64  `json:"quotation_count"`
	NetRevenue     string `json:"net_revenue"`
	Margin         string `json:"margin"`
	DiscountGiven  string `json:"discount_given"`
}

// SalesReport is the reporting payload.
//
// It is returned as data rather than as a rendered document: the frontend
// draws the PDF, so a chart and an export share one source of truth.
type SalesReport struct {
	Rows    []ReportRow     `json:"rows"`
	Summary PipelineSummary `json:"summary"`

	// AppliedFilter is echoed back because a report a manager requested is
	// narrowed to their own team, and they should be able to see that.
	AppliedFilter ReportFilterEcho `json:"applied_filter"`
}

// ReportFilterEcho reports the filter that was actually used.
type ReportFilterEcho struct {
	From       string `json:"from,omitempty"`
	To         string `json:"to,omitempty"`
	RepID      *int64 `json:"rep_id,omitempty"`
	SalesTeam  string `json:"sales_team,omitempty"`
	Status     string `json:"status,omitempty"`
	CategoryID *int64 `json:"category_id,omitempty"`
}
