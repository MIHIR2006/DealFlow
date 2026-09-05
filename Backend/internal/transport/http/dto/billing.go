package dto

// Invoice is money owed. Kind separates the one-off bill for hardware and
// services from the recurring bills a subscription generates.
type Invoice struct {
	ID           int64  `json:"id"`
	Reference    string `json:"reference"`
	SalesOrderID int64  `json:"sales_order_id"`
	Kind         string `json:"kind"`
	Status       string `json:"status"`
	IssueDate    string `json:"issue_date"`
	DueDate      string `json:"due_date,omitempty"`
	Subtotal     string `json:"subtotal"`
	TaxTotal     string `json:"tax_total"`
	Total        string `json:"total"`
	AmountPaid   string `json:"amount_paid"`
	Outstanding  string `json:"outstanding"`
	CustomerName string `json:"customer_name,omitempty"`
}

// InvoiceLine is one row of an invoice.
type InvoiceLine struct {
	ID          int64  `json:"id"`
	Description string `json:"description"`
	Qty         string `json:"qty"`
	UnitPrice   string `json:"unit_price"`
	NetAmount   string `json:"net_amount"`
	TaxAmount   string `json:"tax_amount"`
}

// Payment is money received.
type Payment struct {
	ID         int64  `json:"id"`
	Amount     string `json:"amount"`
	Method     string `json:"method"`
	Reference  string `json:"reference,omitempty"`
	ReceivedAt string `json:"received_at"`
}

// InvoiceDetail is an invoice with its lines and its ledger.
type InvoiceDetail struct {
	Invoice  Invoice       `json:"invoice"`
	Lines    []InvoiceLine `json:"lines"`
	Payments []Payment     `json:"payments"`
}

// BillingScheduleRow is one future recurring invoice.
type BillingScheduleRow struct {
	ID              int64  `json:"id"`
	Seq             int32  `json:"seq"`
	ProductName     string `json:"product_name"`
	PlanName        string `json:"plan_name"`
	PeriodStart     string `json:"period_start"`
	PeriodEnd       string `json:"period_end"`
	Amount          string `json:"amount"`
	ProrationFactor string `json:"proration_factor"`
	Status          string `json:"status"`
}

// CreditNote is money owed back to the customer.
//
// The amount is computed and recorded here; paying it out is a payment
// gateway concern this system does not own.
type CreditNote struct {
	ID              int64  `json:"id"`
	Reference       string `json:"reference"`
	Amount          string `json:"amount"`
	ProrationFactor string `json:"proration_factor"`
	Reason          string `json:"reason"`
	Status          string `json:"status"`
	CreatedAt       string `json:"created_at"`
}

// OrderBilling is both billing tracks of one order, side by side. Keeping
// them separate is the point: one bill for the hardware, a predictable
// recurring one for the plan.
type OrderBilling struct {
	OrderID     int64                `json:"order_id"`
	Invoices    []Invoice            `json:"invoices"`
	Schedule    []BillingScheduleRow `json:"schedule"`
	CreditNotes []CreditNote         `json:"credit_notes"`

	OneTimeTotal   string `json:"one_time_total"`
	RecurringTotal string `json:"recurring_total_per_period"`
}

// RecordPaymentRequest books money received.
//
// Send an Idempotency-Key header. A client that times out cannot tell whether
// its payment landed; with a key, retrying is always the right move.
type RecordPaymentRequest struct {
	Amount    string `json:"amount" binding:"required"`
	Method    string `json:"method" binding:"required,oneof=CASH BANK"`
	Reference string `json:"reference"`
}

// ChangeSubscriptionRequest adjusts a recurring line mid-period.
type ChangeSubscriptionRequest struct {
	Qty int64 `json:"qty" binding:"gte=0"`
}

// ProrationResult explains what a subscription change cost or refunded.
type ProrationResult struct {
	DaysInPeriod  int    `json:"days_in_period"`
	DaysRemaining int    `json:"days_remaining"`
	Factor        string `json:"factor"`
	Amount        string `json:"amount"`
	Kind          string `json:"kind"`
}

// SubscriptionChangeResponse is the outcome of a mid-cycle change.
type SubscriptionChangeResponse struct {
	Proration  ProrationResult `json:"proration"`
	CreditNote *CreditNote     `json:"credit_note,omitempty"`
	Billing    OrderBilling    `json:"billing"`
}
