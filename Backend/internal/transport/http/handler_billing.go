package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
)

type billingHandler struct {
	svc  *service.BillingService
	idem *service.Idempotency
}

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

func (h billingHandler) generate(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	key, err := idempotencyKey(c)
	if err != nil {
		Fail(c, err)
		return
	}

	ctx := c.Request.Context()
	endpoint := fmt.Sprintf("POST /orders/%d/invoices", id)
	status, body, raw, replayed, err := h.idem.Do(ctx, key, endpoint, []byte("{}"), func() (int, any, error) {
		view, err := h.svc.Generate(ctx, actor, id)
		if err != nil {
			return 0, nil, err
		}
		return http.StatusCreated, billingViewDTO(view), nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	writeIdempotentResponse(c, status, body, raw, replayed)
}

func (h billingHandler) getForOrder(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	view, err := h.svc.GetForOrder(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
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
	reqBytes, _ := json.Marshal(req)
	endpoint := fmt.Sprintf("POST /orders/%d/subscriptions/%d/change", id, lineID)
	status, body, raw, replayed, err := h.idem.Do(ctx, key, endpoint, reqBytes, func() (int, any, error) {
		result, err := h.svc.ChangeSubscription(ctx, actor, id, lineID, qty)
		if err != nil {
			return 0, nil, err
		}
		resp := dto.SubscriptionChangeResponse{
			Proration: dto.Proration{
				DaysInPeriod: result.Proration.DaysInPeriod, DaysRemaining: result.Proration.DaysRemaining,
				Factor: result.Proration.Factor.String(), Amount: result.Proration.Amount.String(),
				Kind: string(result.Proration.Kind),
			},
			Billing: billingViewDTO(result.View),
		}
		if result.CreditNote != nil {
			cn := result.CreditNote
			resp.CreditNote = &dto.CreditNote{
				ID: cn.ID, Reference: cn.Reference, Amount: cn.Amount.String(),
				Reason: cn.Reason, Status: cn.Status, CreatedAt: iso(cn.CreatedAt),
			}
		}
		return http.StatusOK, resp, nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	writeIdempotentResponse(c, status, body, raw, replayed)
}

func (h billingHandler) listInvoices(c *gin.Context) {
	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}
	var status *string
	if v := c.Query("status"); v != "" {
		status = &v
	}
	limit := pageLimit(c)

	rows, err := h.svc.ListInvoices(c.Request.Context(), service.InvoiceFilter{
		Status: status, Cursor: cursor, Limit: limit + 1,
	})
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
	}
	OK(c, http.StatusOK, Page[dto.Invoice]{Data: out, NextCursor: next})
}

func (h billingHandler) getInvoice(c *gin.Context) {
	id, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

	detail, err := h.svc.GetInvoice(c.Request.Context(), id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, invoiceDetailDTO(detail))
}

func (h billingHandler) recordPayment(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	key, err := idempotencyKey(c)
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
	reqBytes, _ := json.Marshal(req)
	endpoint := fmt.Sprintf("POST /invoices/%d/payments", id)
	status, body, raw, replayed, err := h.idem.Do(ctx, key, endpoint, reqBytes, func() (int, any, error) {
		detail, err := h.svc.RecordPayment(ctx, actor, id, service.PaymentInput{
			Amount: amount, Method: req.Method, Reference: req.Reference,
		})
		if err != nil {
			return 0, nil, err
		}
		return http.StatusOK, invoiceDetailDTO(detail), nil
	})
	if err != nil {
		Fail(c, err)
		return
	}
	writeIdempotentResponse(c, status, body, raw, replayed)
}

// writeIdempotentResponse renders an idempotency-guarded result. A replay
// writes the exact bytes stored from the original response, so a retried
// request gets a byte-for-byte identical reply; a fresh result is encoded
// normally.
func writeIdempotentResponse(c *gin.Context, status int, body any, raw []byte, replayed bool) {
	if replayed {
		c.Header("Idempotent-Replay", "true")
		c.Data(status, "application/json; charset=utf-8", raw)
		return
	}
	OK(c, status, body)
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

func billingViewDTO(v service.BillingView) dto.OrderBilling {
	out := dto.OrderBilling{
		Invoices:    make([]dto.Invoice, 0, len(v.Invoices)),
		Schedules:   make([]dto.BillingSchedule, 0, len(v.Schedules)),
		CreditNotes: make([]dto.CreditNote, 0, len(v.CreditNotes)),
	}
	oneTime := decimal.Zero
	for _, i := range v.Invoices {
		out.Invoices = append(out.Invoices, invoiceDTO(i))
		if i.Kind == "ONETIME" {
			oneTime = oneTime.Add(i.Total)
		}
	}
	out.OneTimeTotal = oneTime.String()
	// The first period of every recurring line, summed, is the steady-state
	// charge the customer will see repeat each billing period.
	perPeriod := decimal.Zero
	for _, s := range v.Schedules {
		row := dto.BillingSchedule{
			ID: s.ID, QuotationLineID: s.QuotationLineID, PlanName: s.PlanName,
			ProductName: s.ProductName, Seq: s.Seq,
			PeriodStart: iso(s.PeriodStart), PeriodEnd: iso(s.PeriodEnd),
			Amount: s.Amount.String(), ProrationFactor: s.ProrationFactor.String(),
			Status: s.Status,
		}
		out.Schedules = append(out.Schedules, row)
		if s.Seq == 1 {
			perPeriod = perPeriod.Add(s.Amount)
		}
	}
	out.RecurringTotalPerPeriod = perPeriod.String()
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
		Outstanding: i.Total.Sub(i.AmountPaid).String(),
		CreatedAt:   iso(i.CreatedAt),
	}
	if i.DueDate != nil {
		out.DueDate = i.DueDate.Format("2006-01-02")
	}
	return out
}

func invoiceDetailDTO(d service.InvoiceDetail) dto.InvoiceDetail {
	inv := dto.Invoice{
		ID: d.Invoice.ID, Reference: d.Invoice.Reference, SalesOrderID: d.Invoice.SalesOrderID,
		OrderReference: d.Invoice.OrderReference, CustomerName: d.Invoice.CustomerName,
		Kind: d.Invoice.Kind, Status: d.Invoice.Status,
		IssueDate: d.Invoice.IssueDate.Format("2006-01-02"),
		Subtotal:  d.Invoice.Subtotal.String(), TaxTotal: d.Invoice.TaxTotal.String(),
		Total: d.Invoice.Total.String(), AmountPaid: d.Invoice.AmountPaid.String(),
		Outstanding: d.Invoice.Total.Sub(d.Invoice.AmountPaid).String(),
		CreatedAt:   iso(d.Invoice.CreatedAt),
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
	}
	return out
}
