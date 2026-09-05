package dto

// Invoice is one invoice row, joined with its order and customer for
// display in a list.
type Invoice struct {
	ID             int64  `json:"id"`
	Reference      string `json:"reference"`
	SalesOrderID   int64  `json:"sales_order_id"`
	OrderReference string `json:"order_reference,omitempty"`
	CustomerName   string `json:"customer_name,omitempty"`
	Kind           string `json:"kind"`
	Status         string `json:"status"`
	IssueDate      string `json:"issue_date"`
	DueDate        string `json:"due_date,omitempty"`
	Subtotal       string `json:"subtotal"`
	TaxTotal       string `json:"tax_total"`
	Total          string `json:"total"`
	AmountPaid     string `json:"amount_paid"`
	Outstanding    string `json:"outstanding"`
	CreatedAt      string `json:"created_at"`
}

// InvoiceLine is one line of an invoice.
type InvoiceLine struct {
	ID          int64  `json:"id"`
	ProductID   *int64 `json:"product_id,omitempty"`
	Description string `json:"description"`
	Qty         string `json:"qty"`
	UnitPrice   string `json:"unit_price"`
	NetAmount   string `json:"net_amount"`
	TaxAmount   string `json:"tax_amount"`
}

// Payment is one payment recorded against an invoice.
type Payment struct {
	ID         int64  `json:"id"`
	Amount     string `json:"amount"`
	Method     string `json:"method"`
	Reference  string `json:"reference"`
	ReceivedAt string `json:"received_at"`
}

// InvoiceDetail is one invoice with its lines and payment history.
type InvoiceDetail struct {
	Invoice
	Lines    []InvoiceLine `json:"lines"`
	Payments []Payment     `json:"payments"`
}

// BillingSchedule is one future (or past) billing period for a recurring
// line.
type BillingSchedule struct {
	ID              int64  `json:"id"`
	QuotationLineID int64  `json:"quotation_line_id"`
	PlanName        string `json:"plan_name"`
	ProductName     string `json:"product_name"`
	Seq             int32  `json:"seq"`
	PeriodStart     string `json:"period_start"`
	PeriodEnd       string `json:"period_end"`
	Amount          string `json:"amount"`
	ProrationFactor string `json:"proration_factor"`
	Status          string `json:"status"`
}

// CreditNote is a credit issued back to the customer.
type CreditNote struct {
	ID        int64  `json:"id"`
	Reference string `json:"reference"`
	Amount    string `json:"amount"`
	Reason    string `json:"reason"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

// OrderBilling is everything billing has recorded for one order.
type OrderBilling struct {
	Invoices    []Invoice         `json:"invoices"`
	Schedules   []BillingSchedule `json:"schedules"`
	CreditNotes []CreditNote      `json:"credit_notes"`
	// OneTimeTotal is the sum of every one-time invoice's total.
	OneTimeTotal string `json:"one_time_total"`
	// RecurringTotalPerPeriod is the sum of every recurring line's amount
	// for its first billing period — what the customer will see repeat each
	// period once the schedule is running. "0.00" when the order has no
	// recurring lines.
	RecurringTotalPerPeriod string `json:"recurring_total_per_period"`
}

// RecordPaymentRequest records a payment against an invoice.
type RecordPaymentRequest struct {
	Amount    string `json:"amount"    binding:"required"`
	Method    string `json:"method"    binding:"required"`
	Reference string `json:"reference"`
}

// ChangeSubscriptionRequest proposes a new quantity for a recurring line.
type ChangeSubscriptionRequest struct {
	Qty string `json:"qty" binding:"required"`
}

// Proration is the day-count adjustment a mid-cycle subscription quantity
// change produced for the period it landed in.
type Proration struct {
	DaysInPeriod  int    `json:"days_in_period"`
	DaysRemaining int    `json:"days_remaining"`
	Factor        string `json:"factor"`
	Amount        string `json:"amount"`
	Kind          string `json:"kind"`
}

// SubscriptionChangeResponse is what a mid-cycle quantity change produced.
type SubscriptionChangeResponse struct {
	Proration  Proration    `json:"proration"`
	CreditNote *CreditNote  `json:"credit_note"`
	Billing    OrderBilling `json:"billing"`
}
