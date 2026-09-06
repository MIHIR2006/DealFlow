package dto

// Everything in this file is customer-facing.
//
// What is absent matters more than what is present: no unit cost, no margin,
// no blended risk score, no ceilings or overages, no rep identity, and no
// approval chain. Those are internal facts, and a customer learning how close
// their discount sits to an internal limit would be negotiating against our
// own policy.
//
// The omission is enforced by these types rather than by a filter someone
// could forget to apply.

// PortalLine is one row of the quotation as the customer sees it.
type PortalLine struct {
	ID          int64  `json:"id"`
	Position    int32  `json:"position"`
	ProductName string `json:"product_name"`
	Description string `json:"description,omitempty"`

	Qty       string `json:"qty"`
	UnitPrice string `json:"unit_price"`

	// DiscountPct is the effective discount, which is what appears on the
	// invoice. How it was composed is not the customer's concern.
	DiscountPct string `json:"discount_pct"`

	ListValue      string `json:"list_value"`
	DiscountAmount string `json:"discount_amount"`
	NetAmount      string `json:"net_amount"`
	TaxAmount      string `json:"tax_amount"`

	// LineType tells the customer whether a line is a one-off or recurring.
	LineType   string  `json:"line_type"`
	PlanName   *string `json:"plan_name,omitempty"`
	PlanPeriod *string `json:"plan_period,omitempty"`
}

// PortalTotals is what the customer will be billed.
type PortalTotals struct {
	ListSubtotal   string `json:"list_subtotal"`
	DiscountTotal  string `json:"discount_total"`
	NetSubtotal    string `json:"net_subtotal"`
	TaxTotal       string `json:"tax_total"`
	GrandTotal     string `json:"grand_total"`
	OneTimeTotal   string `json:"one_time_total"`
	RecurringTotal string `json:"recurring_total_per_period"`
}

// PortalMessage is one entry in the conversation.
type PortalMessage struct {
	ID          int64  `json:"id"`
	LineID      *int64 `json:"line_id,omitempty"`
	AuthorType  string `json:"author_type"`
	AuthorLabel string `json:"author_label"`
	Body        string `json:"body"`
	CreatedAt   string `json:"created_at"`
}

// PortalCounterOffer is a proposal the customer made and what came of it.
type PortalCounterOffer struct {
	ID                  int64  `json:"id"`
	LineID              *int64 `json:"line_id,omitempty"`
	PreviousDiscountPct string `json:"previous_discount_pct"`
	ProposedDiscountPct string `json:"proposed_discount_pct"`

	// Outcome is AUTO_ACCEPTED when the proposal stayed inside policy, or
	// ROUTED_FOR_APPROVAL when it did not. The customer is told which,
	// without being told what the policy is.
	Outcome   string `json:"outcome"`
	Note      string `json:"note,omitempty"`
	CreatedAt string `json:"created_at"`
}

// PortalQuotation is the whole customer-facing document.
type PortalQuotation struct {
	Reference string `json:"reference"`
	Status    string `json:"status"`

	// CustomerName and CustomerEmail are the account this link was issued
	// to. They are the customer's own details; the tier they sit in is not,
	// because it is an input to our own discount policy.
	CustomerName  string `json:"customer_name"`
	CustomerEmail string `json:"customer_email"`

	ExpiresAt string `json:"expires_at"`

	// OrderDiscountPct is the discount applied across the whole order. It is
	// part of the customer's own commercial terms, and the portal needs it to
	// show what an order-wide counter-offer would be moving from.
	OrderDiscountPct string `json:"order_discount_pct"`

	// AwaitingReview tells the customer their proposal is with us, without
	// exposing who is reviewing it or against what threshold.
	AwaitingReview bool `json:"awaiting_review"`

	// CanConfirm drives the confirm button.
	CanConfirm bool `json:"can_confirm"`

	Lines  []PortalLine `json:"lines"`
	Totals PortalTotals `json:"totals"`

	Messages      []PortalMessage      `json:"messages"`
	CounterOffers []PortalCounterOffer `json:"counter_offers"`
}

// PortalMessageRequest posts a comment, optionally against one line.
type PortalMessageRequest struct {
	LineID *int64 `json:"line_id"`
	Body   string `json:"body" binding:"required"`
}

// PortalCounterOfferRequest proposes a discount.
//
// Omitting line_id proposes it across the whole order.
type PortalCounterOfferRequest struct {
	LineID              *int64 `json:"line_id"`
	ProposedDiscountPct string `json:"proposed_discount_pct" binding:"required"`
	Note                string `json:"note"`
}

// SendQuotationResponse is the link a rep hands to a customer.
type SendQuotationResponse struct {
	Token     string `json:"token"`
	PortalURL string `json:"portal_url"`
	ExpiresAt string `json:"expires_at"`
	// EmailedTo is the address the link was sent to, empty when outbound mail
	// is not configured. The rep's screen says "emailed and copied" or just
	// "copied" on the strength of this rather than assuming.
	EmailedTo string `json:"emailed_to,omitempty"`
}

// ---------------------------------------------------------------------------
// The staff side of the negotiation
// ---------------------------------------------------------------------------

// ThreadMessage is one entry of the negotiation as staff see it.
//
// It carries the line's product name so the internal thread can say which item
// a comment was about without the client joining anything.
type ThreadMessage struct {
	ID          int64   `json:"id"`
	LineID      *int64  `json:"line_id,omitempty"`
	ProductName *string `json:"product_name,omitempty"`
	AuthorType  string  `json:"author_type"`
	AuthorLabel string  `json:"author_label"`
	Body        string  `json:"body"`
	CreatedAt   string  `json:"created_at"`
}

// NegotiationThread is the whole conversation for one quotation, staff-side.
type NegotiationThread struct {
	QuotationID int64  `json:"quotation_id"`
	Reference   string `json:"reference"`
	Status      string `json:"status"`

	// Negotiable reports whether a reply will be accepted, so the composer
	// can be disabled for the same reasons the service would refuse it.
	Negotiable bool `json:"negotiable"`

	Messages      []ThreadMessage      `json:"messages"`
	CounterOffers []PortalCounterOffer `json:"counter_offers"`
}

// StaffMessageRequest posts a reply to the customer, optionally about one line.
type StaffMessageRequest struct {
	LineID *int64 `json:"line_id"`
	Body   string `json:"body" binding:"required"`
}
