package http

import (
<<<<<<< HEAD
=======
	"encoding/json"
	"fmt"
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
<<<<<<< HEAD
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

// HeaderIdempotencyKey makes a money-moving request safe to retry.
const HeaderIdempotencyKey = "Idempotency-Key"

=======
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
)

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
type billingHandler struct {
	svc  *service.BillingService
	idem *service.Idempotency
}

<<<<<<< HEAD
=======
// idempotencyKey reads the header every money-moving billing endpoint
// requires. Without one, a retried request (a flaky connection, a
// double-clicked button) could post the same invoice or payment twice.
func idempotencyKey(c *gin.Context) (string, error) {
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		return "", apierr.Validation("the Idempotency-Key header is required for this request")
	}
	return key, nil
}

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h billingHandler) generate(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD

	billing, err := h.svc.Generate(c.Request.Context(), actor, id)
=======
	key, err := idempotencyKey(c)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	OK(c, http.StatusCreated, billingDTO(billing))
=======

	ctx := c.Request.Context()
	endpoint := fmt.Sprintf("POST /orders/%d/invoices", id)
	status, body, err := h.idem.Do(ctx, key, endpoint, []byte("{}"), func() (int, any, error) {
		view, err := h.svc.Generate(ctx, actor, id)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, billingViewDTO(view), nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, status, body)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
}

func (h billingHandler) getForOrder(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	billing, err := h.svc.Get(c.Request.Context(), actor, id)
=======
	view, err := h.svc.GetForOrder(c.Request.Context(), actor, id)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	OK(c, http.StatusOK, billingDTO(billing))
}

func (h billingHandler) listInvoices(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

=======
	OK(c, http.StatusOK, billingViewDTO(view))
}

func (h billingHandler) changeSubscription(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	lineID, err := pathInt64(c, "lineId")
	if err != nil {
		Fail(c, err)
		return
	}
	key, err := idempotencyKey(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.ChangeSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	qty, err := parseDecimal(req.Qty, "qty")
	if err != nil {
		Fail(c, err)
		return
	}

	ctx := c.Request.Context()
	raw, _ := json.Marshal(req)
	endpoint := fmt.Sprintf("POST /orders/%d/subscriptions/%d/change", id, lineID)
	status, body, err := h.idem.Do(ctx, key, endpoint, raw, func() (int, any, error) {
		result, err := h.svc.ChangeSubscription(ctx, actor, id, lineID, qty)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, dto.SubscriptionChangeResponse{
			Kind: string(result.Kind), Amount: result.Amount.String(), Factor: result.Factor.String(),
			Billing: billingViewDTO(result.View),
		}, nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, status, body)
}

func (h billingHandler) listInvoices(c *gin.Context) {
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}
	var status *string
<<<<<<< HEAD
	if s := c.Query("status"); s != "" {
		status = &s
	}

	limit := pageLimit(c)
	rows, err := h.svc.ListInvoices(c.Request.Context(), actor, status, cursor, limit+1)
=======
	if v := c.Query("status"); v != "" {
		status = &v
	}
	limit := pageLimit(c)

	rows, err := h.svc.ListInvoices(c.Request.Context(), service.InvoiceFilter{
		Status: status, Cursor: cursor, Limit: limit + 1,
	})
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
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
<<<<<<< HEAD
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
=======
		out = append(out, dto.Invoice{
			ID: r.ID, Reference: r.Reference, SalesOrderID: r.SalesOrderID,
			OrderReference: r.OrderReference, CustomerName: r.CustomerName,
			Kind: r.Kind, Status: r.Status, IssueDate: r.IssueDate.Format("2006-01-02"),
			Subtotal: r.Subtotal.String(), TaxTotal: r.TaxTotal.String(),
			Total: r.Total.String(), AmountPaid: r.AmountPaid.String(),
			CreatedAt: iso(r.CreatedAt),
		})
		if r.DueDate != nil {
			out[len(out)-1].DueDate = r.DueDate.Format("2006-01-02")
		}
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	}
	OK(c, http.StatusOK, Page[dto.Invoice]{Data: out, NextCursor: next})
}

func (h billingHandler) getInvoice(c *gin.Context) {
<<<<<<< HEAD
	actor, id, err := actorAndID(c)
=======
	id, err := pathInt64(c, "id")
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	detail, err := h.svc.GetInvoice(c.Request.Context(), actor, id)
=======
	detail, err := h.svc.GetInvoice(c.Request.Context(), id)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD

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
=======
	OK(c, http.StatusOK, invoiceDetailDTO(detail))
}

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h billingHandler) recordPayment(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
=======
	key, err := idempotencyKey(c)
	if err != nil {
		Fail(c, err)
		return
	}
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248

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
<<<<<<< HEAD
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
=======
	raw, _ := json.Marshal(req)
	endpoint := fmt.Sprintf("POST /invoices/%d/payments", id)
	status, body, err := h.idem.Do(ctx, key, endpoint, raw, func() (int, any, error) {
		detail, err := h.svc.RecordPayment(ctx, actor, id, service.PaymentInput{
			Amount: amount, Method: req.Method, Reference: req.Reference,
		})
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, invoiceDetailDTO(detail), nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, status, body)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

<<<<<<< HEAD
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
=======
func billingViewDTO(v service.BillingView) dto.OrderBilling {
	out := dto.OrderBilling{
		Invoices:    make([]dto.Invoice, 0, len(v.Invoices)),
		Schedules:   make([]dto.BillingSchedule, 0, len(v.Schedules)),
		CreditNotes: make([]dto.CreditNote, 0, len(v.CreditNotes)),
	}
	for _, i := range v.Invoices {
		out.Invoices = append(out.Invoices, invoiceDTO(i))
	}
	for _, s := range v.Schedules {
		row := dto.BillingSchedule{
			ID: s.ID, QuotationLineID: s.QuotationLineID, PlanName: s.PlanName,
			ProductName: s.ProductName, Seq: s.Seq,
			PeriodStart: iso(s.PeriodStart), PeriodEnd: iso(s.PeriodEnd),
			Amount: s.Amount.String(), ProrationFactor: s.ProrationFactor.String(),
			Status: s.Status,
		}
		out.Schedules = append(out.Schedules, row)
	}
	for _, cn := range v.CreditNotes {
		out.CreditNotes = append(out.CreditNotes, dto.CreditNote{
			ID: cn.ID, Reference: cn.Reference, Amount: cn.Amount.String(),
			Reason: cn.Reason, Status: cn.Status, CreatedAt: iso(cn.CreatedAt),
		})
	}
	return out
}

func invoiceDTO(i sqlcgen.Invoice) dto.Invoice {
	out := dto.Invoice{
		ID: i.ID, Reference: i.Reference, SalesOrderID: i.SalesOrderID,
		Kind: i.Kind, Status: i.Status, IssueDate: i.IssueDate.Format("2006-01-02"),
		Subtotal: i.Subtotal.String(), TaxTotal: i.TaxTotal.String(),
		Total: i.Total.String(), AmountPaid: i.AmountPaid.String(),
		CreatedAt: iso(i.CreatedAt),
	}
	if i.DueDate != nil {
		out.DueDate = i.DueDate.Format("2006-01-02")
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	}
	return out
}

<<<<<<< HEAD
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
=======
func invoiceDetailDTO(d service.InvoiceDetail) dto.InvoiceDetail {
	inv := dto.Invoice{
		ID: d.Invoice.ID, Reference: d.Invoice.Reference, SalesOrderID: d.Invoice.SalesOrderID,
		OrderReference: d.Invoice.OrderReference, CustomerName: d.Invoice.CustomerName,
		Kind: d.Invoice.Kind, Status: d.Invoice.Status,
		IssueDate: d.Invoice.IssueDate.Format("2006-01-02"),
		Subtotal:  d.Invoice.Subtotal.String(), TaxTotal: d.Invoice.TaxTotal.String(),
		Total: d.Invoice.Total.String(), AmountPaid: d.Invoice.AmountPaid.String(),
		CreatedAt: iso(d.Invoice.CreatedAt),
	}
	if d.Invoice.DueDate != nil {
		inv.DueDate = d.Invoice.DueDate.Format("2006-01-02")
	}

	out := dto.InvoiceDetail{
		Invoice:  inv,
		Lines:    make([]dto.InvoiceLine, 0, len(d.Lines)),
		Payments: make([]dto.Payment, 0, len(d.Payments)),
	}
	for _, l := range d.Lines {
		out.Lines = append(out.Lines, dto.InvoiceLine{
			ID: l.ID, ProductID: l.ProductID, Description: l.Description,
			Qty: l.Qty.String(), UnitPrice: l.UnitPrice.String(),
			NetAmount: l.NetAmount.String(), TaxAmount: l.TaxAmount.String(),
		})
	}
	for _, p := range d.Payments {
		out.Payments = append(out.Payments, dto.Payment{
			ID: p.ID, Amount: p.Amount.String(), Method: p.Method,
			Reference: p.Reference, ReceivedAt: iso(p.ReceivedAt),
		})
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	}
	return out
}
