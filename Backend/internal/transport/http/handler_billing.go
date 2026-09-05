package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

// HeaderIdempotencyKey makes a money-moving request safe to retry.
const HeaderIdempotencyKey = "Idempotency-Key"

type billingHandler struct {
	svc  *service.BillingService
	idem *service.Idempotency
}

func (h billingHandler) generate(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	billing, err := h.svc.Generate(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, billingDTO(billing))
}

func (h billingHandler) getForOrder(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	billing, err := h.svc.Get(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, billingDTO(billing))
}

func (h billingHandler) listInvoices(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}
	var status *string
	if s := c.Query("status"); s != "" {
		status = &s
	}

	limit := pageLimit(c)
	rows, err := h.svc.ListInvoices(c.Request.Context(), actor, status, cursor, limit+1)
	if err != nil {
		Fail(c, err)
		return
	}

	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.Invoice, 0, len(rows))
	for _, r := range rows {
		inv := dto.Invoice{
			ID: r.ID, Reference: r.Reference, SalesOrderID: r.SalesOrderID,
			Kind: r.Kind, Status: r.Status,
			IssueDate:    iso(r.IssueDate),
			Subtotal:     r.Subtotal.String(),
			TaxTotal:     r.TaxTotal.String(),
			Total:        r.Total.String(),
			AmountPaid:   r.AmountPaid.String(),
			Outstanding:  money.RoundAmount(r.Total.Sub(r.AmountPaid)).String(),
			CustomerName: r.CustomerName,
		}
		if r.DueDate != nil {
			inv.DueDate = iso(*r.DueDate)
		}
		out = append(out, inv)
	}
	OK(c, http.StatusOK, Page[dto.Invoice]{Data: out, NextCursor: next})
}

func (h billingHandler) getInvoice(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	detail, err := h.svc.GetInvoice(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}

	inv := dto.Invoice{
		ID: detail.Invoice.ID, Reference: detail.Invoice.Reference,
		SalesOrderID: detail.Invoice.SalesOrderID,
		Kind:         detail.Invoice.Kind, Status: detail.Invoice.Status,
		IssueDate:  iso(detail.Invoice.IssueDate),
		Subtotal:   detail.Invoice.Subtotal.String(),
		TaxTotal:   detail.Invoice.TaxTotal.String(),
		Total:      detail.Invoice.Total.String(),
		AmountPaid: detail.Invoice.AmountPaid.String(),
		Outstanding: money.RoundAmount(
			detail.Invoice.Total.Sub(detail.Invoice.AmountPaid)).String(),
		CustomerName: detail.Invoice.CustomerName,
	}
	if detail.Invoice.DueDate != nil {
		inv.DueDate = iso(*detail.Invoice.DueDate)
	}

	out := dto.InvoiceDetail{
		Invoice:  inv,
		Lines:    make([]dto.InvoiceLine, 0, len(detail.Lines)),
		Payments: make([]dto.Payment, 0, len(detail.Payments)),
	}
	for _, l := range detail.Lines {
		out.Lines = append(out.Lines, dto.InvoiceLine{
			ID: l.ID, Description: l.Description,
			Qty: l.Qty.String(), UnitPrice: l.UnitPrice.String(),
			NetAmount: l.NetAmount.String(), TaxAmount: l.TaxAmount.String(),
		})
	}
	for _, p := range detail.Payments {
		out.Payments = append(out.Payments, dto.Payment{
			ID: p.ID, Amount: p.Amount.String(), Method: p.Method,
			Reference: p.Reference, ReceivedAt: iso(p.ReceivedAt),
		})
	}
	OK(c, http.StatusOK, out)
}

// recordPayment books money received, idempotently.
//
// The key is reserved before the payment is written, so two concurrent
// retries of the same request cannot both charge. A retry after success
// replays the original response rather than doing the work again.
func (h billingHandler) recordPayment(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.RecordPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	amount, err := parseDecimal(req.Amount, "amount")
	if err != nil {
		Fail(c, err)
		return
	}

	ctx := c.Request.Context()
	key := c.GetHeader(HeaderIdempotencyKey)
	endpoint := "POST /invoices/:id/payments/" + strconv.FormatInt(id, 10)

	replay, err := h.idem.Begin(ctx, key, endpoint, req)
	if err != nil {
		Fail(c, err)
		return
	}
	if replay != nil {
		c.Header("Idempotent-Replay", "true")
		c.Data(replay.Status, "application/json; charset=utf-8", replay.Body)
		c.Abort()
		return
	}

	invoice, err := h.svc.RecordPayment(ctx, actor, service.PaymentInput{
		InvoiceID: id, Amount: amount, Method: req.Method, Reference: req.Reference,
	})
	if err != nil {
		// Release the reservation so the client can correct and retry rather
		// than being told forever that a request is in flight.
		h.idem.Abort(ctx, key, endpoint)
		Fail(c, err)
		return
	}

	body := invoiceDTO(invoice)
	h.idem.Complete(ctx, key, endpoint, http.StatusOK, body)
	OK(c, http.StatusOK, body)
}

func (h billingHandler) changeSubscription(c *gin.Context) {
	actor, orderID, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	lineID, err := pathInt64(c, "lineId")
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.ChangeSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	result, err := h.svc.ChangeSubscriptionQuantity(c.Request.Context(), actor,
		service.SubscriptionChange{OrderID: orderID, LineID: lineID, NewQty: req.Qty})
	if err != nil {
		Fail(c, err)
		return
	}

	out := dto.SubscriptionChangeResponse{
		Proration: dto.ProrationResult{
			DaysInPeriod:  result.Proration.DaysInPeriod,
			DaysRemaining: result.Proration.DaysRemaining,
			Factor:        result.Proration.Factor.String(),
			Amount:        result.Proration.Amount.String(),
			Kind:          string(result.Proration.Kind),
		},
		Billing: billingDTO(result.Billing),
	}
	if result.CreditNote != nil {
		note := creditNoteDTO(*result.CreditNote)
		out.CreditNote = &note
	}
	OK(c, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

func invoiceDTO(i sqlcgen.Invoice) dto.Invoice {
	out := dto.Invoice{
		ID: i.ID, Reference: i.Reference, SalesOrderID: i.SalesOrderID,
		Kind: i.Kind, Status: i.Status,
		IssueDate:   iso(i.IssueDate),
		Subtotal:    i.Subtotal.String(),
		TaxTotal:    i.TaxTotal.String(),
		Total:       i.Total.String(),
		AmountPaid:  i.AmountPaid.String(),
		Outstanding: money.RoundAmount(i.Total.Sub(i.AmountPaid)).String(),
	}
	if i.DueDate != nil {
		out.DueDate = iso(*i.DueDate)
	}
	return out
}

func creditNoteDTO(n sqlcgen.CreditNote) dto.CreditNote {
	return dto.CreditNote{
		ID: n.ID, Reference: n.Reference,
		Amount:          n.Amount.String(),
		ProrationFactor: n.ProrationFactor.String(),
		Reason:          n.Reason, Status: n.Status,
		CreatedAt: iso(n.CreatedAt),
	}
}

func billingDTO(b service.Billing) dto.OrderBilling {
	out := dto.OrderBilling{
		OrderID:     b.OrderID,
		Invoices:    make([]dto.Invoice, 0, len(b.Invoices)),
		Schedule:    make([]dto.BillingScheduleRow, 0, len(b.Schedules)),
		CreditNotes: make([]dto.CreditNote, 0, len(b.CreditNotes)),
	}

	oneTime := money.Zero()
	for _, i := range b.Invoices {
		out.Invoices = append(out.Invoices, invoiceDTO(i))
		if i.Kind == "ONETIME" {
			oneTime = oneTime.Add(i.Total)
		}
	}
	out.OneTimeTotal = oneTime.String()

	// The recurring figure is what one period costs, not the sum of every
	// period: a customer asks "what do I pay a month", not "what will I have
	// paid in three years".
	perPeriod := money.Zero()
	firstSeq := map[int64]bool{}
	for _, sch := range b.Schedules {
		out.Schedule = append(out.Schedule, dto.BillingScheduleRow{
			ID: sch.ID, Seq: sch.Seq,
			ProductName: sch.ProductName, PlanName: sch.PlanName,
			PeriodStart: iso(sch.PeriodStart), PeriodEnd: iso(sch.PeriodEnd),
			Amount:          sch.Amount.String(),
			ProrationFactor: sch.ProrationFactor.String(),
			Status:          sch.Status,
		})
		if sch.Status == "SCHEDULED" && !firstSeq[sch.QuotationLineID] {
			perPeriod = perPeriod.Add(sch.Amount)
			firstSeq[sch.QuotationLineID] = true
		}
	}
	out.RecurringTotal = perPeriod.String()

	for _, n := range b.CreditNotes {
		out.CreditNotes = append(out.CreditNotes, creditNoteDTO(n))
	}
	return out
}
