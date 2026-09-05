package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/billing"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// BillingService owns the two tracks a confirmed order can carry: a single
// invoice for its one-time lines, and a schedule of future periods for its
// recurring ones.
//
// Generating is safe to call more than once for the same order: it only ever
// creates the one-time invoice, or the recurring schedule, that does not
// already exist. That, together with the idempotency key the handler wraps
// it in, is what makes a retried "generate invoice" request harmless.
type BillingService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewBillingService builds the service.
func NewBillingService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *BillingService {
	return &BillingService{pool: pool, q: q, quote: quote}
}

// dueInDays is how long a customer has to pay a one-time invoice.
const dueInDays = 30

// BillingView is everything billing has recorded for one order.
type BillingView struct {
	Invoices    []sqlcgen.Invoice
	Schedules   []sqlcgen.ListBillingSchedulesForOrderRow
	CreditNotes []sqlcgen.CreditNote
}

// orderAndQuotation loads a sales order and establishes that actor may see
// the quotation behind it, in one place so every billing entry point applies
// the same visibility rule.
func (s *BillingService) orderAndQuotation(ctx context.Context, actor auth.Principal, orderID int64) (sqlcgen.GetSalesOrderRow, error) {
	order, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return order, apierr.NotFound("order not found")
		}
		return order, apierr.Internal(fmt.Errorf("get sales order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return order, err
	}
	return order, nil
}

// GetForOrder returns everything billing has recorded for one order.
func (s *BillingService) GetForOrder(ctx context.Context, actor auth.Principal, orderID int64) (BillingView, error) {
	if _, err := s.orderAndQuotation(ctx, actor, orderID); err != nil {
		return BillingView{}, err
	}
	return s.view(ctx, orderID)
}

func (s *BillingService) view(ctx context.Context, orderID int64) (BillingView, error) {
	invoices, err := s.q.ListInvoicesForOrder(ctx, orderID)
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list invoices for order: %w", err))
	}
	schedules, err := s.q.ListBillingSchedulesForOrder(ctx, orderID)
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list billing schedules for order: %w", err))
	}
	creditNotes, err := s.q.ListCreditNotesForOrder(ctx, orderID)
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list credit notes for order: %w", err))
	}
	return BillingView{Invoices: invoices, Schedules: schedules, CreditNotes: creditNotes}, nil
}

// Generate posts the one-time invoice and lays out the recurring schedule
// for an order, whichever of the two it has not already produced.
func (s *BillingService) Generate(ctx context.Context, actor auth.Principal, orderID int64) (BillingView, error) {
	order, err := s.orderAndQuotation(ctx, actor, orderID)
	if err != nil {
		return BillingView{}, err
	}

	lines, err := s.q.ListQuotationLines(ctx, order.QuotationID)
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list quotation lines: %w", err))
	}
	if len(lines) == 0 {
		return BillingView{}, apierr.Validation("this order has no lines to bill")
	}

	existingInvoices, err := s.q.ListInvoicesForOrder(ctx, orderID)
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list invoices for order: %w", err))
	}
	hasOneTimeInvoice := false
	for _, inv := range existingInvoices {
		if inv.Kind == "ONETIME" {
			hasOneTimeInvoice = true
		}
	}

	existingSchedules, err := s.q.ListBillingSchedulesForOrder(ctx, orderID)
	hasSchedule := len(existingSchedules) > 0
	if err != nil {
		return BillingView{}, apierr.Internal(fmt.Errorf("list billing schedules for order: %w", err))
	}

	var oneTime, recurring []sqlcgen.ListQuotationLinesRow
	for _, l := range lines {
		if l.LineType == "ONETIME" {
			oneTime = append(oneTime, l)
		} else {
			recurring = append(recurring, l)
		}
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if !hasOneTimeInvoice && len(oneTime) > 0 {
			if err := createOneTimeInvoice(ctx, qtx, order.ID, oneTime); err != nil {
				return err
			}
		}
		if !hasSchedule && len(recurring) > 0 {
			if err := createRecurringSchedule(ctx, qtx, order.ID, recurring); err != nil {
				return err
			}
		}

		if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
			ID: order.ID, Status: "INVOICED",
		}); err != nil {
			return fmt.Errorf("update sales order status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return BillingView{}, apiErr
		}
		return BillingView{}, apierr.Internal(err)
	}

	s.quote.audit(ctx, order.QuotationID, "INVOICE_GENERATED", actor,
		fmt.Sprintf("%d one-time line(s), %d recurring line(s)", len(oneTime), len(recurring)),
		map[string]any{"sales_order_id": order.ID})

	return s.view(ctx, order.ID)
}

func createOneTimeInvoice(ctx context.Context, qtx *sqlcgen.Queries, orderID int64, lines []sqlcgen.ListQuotationLinesRow) error {
	ref, err := qtx.NextInvoiceReference(ctx)
	if err != nil {
		return fmt.Errorf("next invoice reference: %w", err)
	}

	subtotal := decimal.Zero
	taxTotal := decimal.Zero
	invoiceLines := make([]sqlcgen.InsertInvoiceLinesParams, 0, len(lines))
	for _, l := range lines {
		subtotal = subtotal.Add(l.NetAmount)
		taxTotal = taxTotal.Add(l.TaxAmount)
		invoiceLines = append(invoiceLines, sqlcgen.InsertInvoiceLinesParams{
			ProductID: &l.ProductID, Description: l.ProductName,
			Qty: l.Qty, UnitPrice: l.UnitPrice, NetAmount: l.NetAmount, TaxAmount: l.TaxAmount,
		})
	}

	due := time.Now().AddDate(0, 0, dueInDays)
	inv, err := qtx.CreateInvoice(ctx, sqlcgen.CreateInvoiceParams{
		Reference: ref, SalesOrderID: orderID, Kind: "ONETIME", Status: "POSTED",
		IssueDate: time.Now(), DueDate: &due,
		Subtotal: subtotal, TaxTotal: taxTotal, Total: subtotal.Add(taxTotal),
	})
	if err != nil {
		return fmt.Errorf("create invoice: %w", err)
	}

	for i := range invoiceLines {
		invoiceLines[i].InvoiceID = inv.ID
	}
	if _, err := qtx.InsertInvoiceLines(ctx, invoiceLines); err != nil {
		return fmt.Errorf("insert invoice lines: %w", err)
	}
	return nil
}

func createRecurringSchedule(ctx context.Context, qtx *sqlcgen.Queries, orderID int64, lines []sqlcgen.ListQuotationLinesRow) error {
	start := time.Now()

	var rows []sqlcgen.InsertBillingSchedulesParams
	for _, l := range lines {
		if l.PlanID == nil || l.PlanPeriod == nil || l.PlanCycles == nil {
			return apierr.Validation(fmt.Sprintf("line %d is recurring but has no subscription plan", l.ID))
		}

		// The line's net amount, already discounted, is billed once per
		// period as a single unit: it is the whole subscribed configuration,
		// not a per-seat price, so nothing is lost by treating quantity as 1.
		generated := billing.GenerateSchedule(billing.ScheduleInput{
			QuotationLineID: l.ID,
			Period:          billing.Period(*l.PlanPeriod),
			UnitPrice:       l.NetAmount,
			Qty:             1,
			StartDate:       start,
			Cycles:          int(*l.PlanCycles),
		})

		for _, g := range generated {
			rows = append(rows, sqlcgen.InsertBillingSchedulesParams{
				SalesOrderID: orderID, QuotationLineID: g.QuotationLineID, PlanID: *l.PlanID,
				Seq: int32(g.Seq), PeriodStart: g.PeriodStart, PeriodEnd: g.PeriodEnd, //nolint:gosec // a period sequence never approaches int32 range
				Amount: g.Amount, ProrationFactor: g.ProrationFactor,
			})
		}
	}

	if len(rows) == 0 {
		return nil
	}
	if _, err := qtx.InsertBillingSchedules(ctx, rows); err != nil {
		return fmt.Errorf("insert billing schedules: %w", err)
	}
	return nil
}

// InvoiceDetail is one invoice with its lines and the payments recorded
// against it.
type InvoiceDetail struct {
	Invoice  sqlcgen.GetInvoiceRow
	Lines    []sqlcgen.InvoiceLine
	Payments []sqlcgen.Payment
}

// InvoiceFilter narrows the invoice listing.
type InvoiceFilter struct {
	Status *string
	Cursor *int64
	Limit  int32
}

// ListInvoices returns invoices across every order.
func (s *BillingService) ListInvoices(ctx context.Context, f InvoiceFilter) ([]sqlcgen.ListInvoicesRow, error) {
	rows, err := s.q.ListInvoices(ctx, sqlcgen.ListInvoicesParams{
		Status: f.Status, Cursor: f.Cursor, PageSize: f.Limit,
	})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list invoices: %w", err))
	}
	return rows, nil
}

// GetInvoice returns one invoice with its lines and payment history.
func (s *BillingService) GetInvoice(ctx context.Context, invoiceID int64) (InvoiceDetail, error) {
	inv, err := s.q.GetInvoice(ctx, invoiceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InvoiceDetail{}, apierr.NotFound("invoice not found")
		}
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("get invoice: %w", err))
	}
	lines, err := s.q.ListInvoiceLines(ctx, invoiceID)
	if err != nil {
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("list invoice lines: %w", err))
	}
	payments, err := s.q.ListPaymentsForInvoice(ctx, invoiceID)
	if err != nil {
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("list payments for invoice: %w", err))
	}
	return InvoiceDetail{Invoice: inv, Lines: lines, Payments: payments}, nil
}

// validPaymentMethods mirrors the payments.method CHECK constraint.
var validPaymentMethods = map[string]bool{"CASH": true, "BANK": true}

// PaymentInput is a payment recorded against an invoice.
type PaymentInput struct {
	Amount    decimal.Decimal
	Method    string
	Reference string
}

// RecordPayment records a payment and recalculates the invoice's paid amount
// and status from the ledger, so the two can never drift apart.
func (s *BillingService) RecordPayment(ctx context.Context, actor auth.Principal, invoiceID int64, in PaymentInput) (InvoiceDetail, error) {
	if in.Amount.LessThanOrEqual(decimal.Zero) {
		return InvoiceDetail{}, apierr.Validation("amount must be greater than zero")
	}
	if !validPaymentMethods[in.Method] {
		return InvoiceDetail{}, apierr.Validation("method must be one of: CASH, BANK")
	}

	inv, err := s.q.GetInvoice(ctx, invoiceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InvoiceDetail{}, apierr.NotFound("invoice not found")
		}
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("get invoice: %w", err))
	}
	if inv.Status == "PAID" || inv.Status == "CANCELLED" {
		return InvoiceDetail{}, apierr.Conflict(fmt.Sprintf("an invoice in %s cannot take a payment", inv.Status))
	}

	order, err := s.orderAndQuotation(ctx, actor, inv.SalesOrderID)
	if err != nil {
		return InvoiceDetail{}, err
	}

	actorID := actor.UserID
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if _, err := qtx.CreatePayment(ctx, sqlcgen.CreatePaymentParams{
			InvoiceID: invoiceID, Amount: in.Amount, Method: in.Method,
			Reference: in.Reference, RecordedBy: &actorID,
		}); err != nil {
			return fmt.Errorf("create payment: %w", err)
		}

		updated, err := qtx.RecalculateInvoicePayment(ctx, invoiceID)
		if err != nil {
			return fmt.Errorf("recalculate invoice payment: %w", err)
		}
		// Checked post-insert, inside the transaction, against the ledger's
		// own recalculated sum — never the pre-insert amount a concurrent
		// payment could have raced past.
		if updated.AmountPaid.GreaterThan(updated.Total) {
			return apierr.Conflict(fmt.Sprintf(
				"payment of %s would overpay this invoice: %s already paid of %s total",
				in.Amount, inv.AmountPaid, inv.Total))
		}

		if updated.Status == "PAID" {
			all, err := qtx.ListInvoicesForOrder(ctx, order.ID)
			if err != nil {
				return fmt.Errorf("list invoices for order: %w", err)
			}
			fullyPaid := true
			for _, i := range all {
				if i.Status != "PAID" {
					fullyPaid = false
					break
				}
			}
			if fullyPaid {
				if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
					ID: order.ID, Status: "PAID",
				}); err != nil {
					return fmt.Errorf("update sales order status: %w", err)
				}
			}
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return InvoiceDetail{}, apiErr
		}
		return InvoiceDetail{}, apierr.Internal(err)
	}

	s.quote.audit(ctx, order.QuotationID, "PAYMENT_RECORDED", actor,
		fmt.Sprintf("%s %s payment against %s", in.Amount, in.Method, inv.Reference),
		map[string]any{"invoice_id": invoiceID, "amount": in.Amount.String(), "method": in.Method})

	return s.GetInvoice(ctx, invoiceID)
}

// SubscriptionChangeResult is what a mid-cycle quantity change produced.
type SubscriptionChangeResult struct {
	View       BillingView
	Proration  billing.ProrationResult
	CreditNote *sqlcgen.CreditNote // nil unless the change produced one
}

// ChangeSubscription applies a mid-cycle quantity change to one recurring
// line: the remainder of the current period is prorated, and every future
// scheduled period moves to the new quantity.
func (s *BillingService) ChangeSubscription(ctx context.Context, actor auth.Principal, orderID, lineID int64, newQty decimal.Decimal) (SubscriptionChangeResult, error) {
	if newQty.LessThan(decimal.Zero) {
		return SubscriptionChangeResult{}, apierr.Validation("qty must not be negative")
	}
	cancelling := newQty.IsZero()

	order, err := s.orderAndQuotation(ctx, actor, orderID)
	if err != nil {
		return SubscriptionChangeResult{}, err
	}

	lines, err := s.q.ListQuotationLines(ctx, order.QuotationID)
	if err != nil {
		return SubscriptionChangeResult{}, apierr.Internal(fmt.Errorf("list quotation lines: %w", err))
	}
	var line *sqlcgen.ListQuotationLinesRow
	for i := range lines {
		if lines[i].ID == lineID {
			line = &lines[i]
			break
		}
	}
	if line == nil {
		return SubscriptionChangeResult{}, apierr.NotFound("that line is not on this order")
	}
	if line.LineType != "RECURRING" {
		return SubscriptionChangeResult{}, apierr.Validation("only a recurring line has a subscription quantity to change")
	}

	current, err := s.q.GetCurrentBillingPeriod(ctx, lineID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SubscriptionChangeResult{}, apierr.Conflict("this line has no active billing period to change")
		}
		return SubscriptionChangeResult{}, apierr.Internal(fmt.Errorf("get current billing period: %w", err))
	}

	oldQty := line.Qty.IntPart()
	if oldQty <= 0 {
		oldQty = 1
	}
	unitNet := line.NetAmount.DivRound(decimal.NewFromInt(oldQty), 6)
	deltaQty := newQty.IntPart() - oldQty

	result := billing.Prorate(billing.ProrationInput{
		ChangeDate: time.Now(), PeriodStart: current.PeriodStart, PeriodEnd: current.PeriodEnd,
		DeltaQty: deltaQty, UnitPrice: unitNet,
	})
	newPeriodAmount := unitNet.Mul(newQty).Round(2)

	var creditNote *sqlcgen.CreditNote
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if cancelling {
			if _, err := qtx.CancelScheduleAmountsFrom(ctx, sqlcgen.CancelScheduleAmountsFromParams{
				QuotationLineID: lineID, AfterSeq: current.Seq,
			}); err != nil {
				return fmt.Errorf("cancel schedule amounts: %w", err)
			}
		} else if _, err := qtx.UpdateScheduleAmountsFrom(ctx, sqlcgen.UpdateScheduleAmountsFromParams{
			Amount: newPeriodAmount, QuotationLineID: lineID, AfterSeq: current.Seq,
		}); err != nil {
			return fmt.Errorf("update schedule amounts: %w", err)
		}

		switch result.Kind {
		case billing.KindCharge:
			if _, err := qtx.AdjustScheduleAmount(ctx, sqlcgen.AdjustScheduleAmountParams{
				Delta: result.Amount, ID: current.ID,
			}); err != nil {
				return fmt.Errorf("adjust schedule amount: %w", err)
			}
		case billing.KindCredit:
			reason := "Subscription quantity reduced mid-cycle"
			if cancelling {
				reason = "Subscription cancelled mid-cycle"
			}
			ref, err := qtx.NextCreditNoteReference(ctx)
			if err != nil {
				return fmt.Errorf("next credit note reference: %w", err)
			}
			actorID := actor.UserID
			cn, err := qtx.CreateCreditNote(ctx, sqlcgen.CreateCreditNoteParams{
				Reference: ref, SalesOrderID: orderID, BillingScheduleID: &current.ID,
				QuotationLineID: &lineID, Amount: result.Amount, ProrationFactor: result.Factor,
				Reason: reason, CreatedBy: &actorID,
			})
			if err != nil {
				return fmt.Errorf("create credit note: %w", err)
			}
			creditNote = &cn
		}

		// A line's qty must stay positive (it is what was ordered); cancelling
		// stops future billing without rewriting that record to zero.
		if !cancelling {
			if _, err := qtx.UpdateQuotationLineInput(ctx, sqlcgen.UpdateQuotationLineInputParams{
				ID: lineID, Qty: newQty, LineDiscountPct: line.LineDiscountPct,
			}); err != nil {
				return fmt.Errorf("update quotation line: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return SubscriptionChangeResult{}, apiErr
		}
		return SubscriptionChangeResult{}, apierr.Internal(err)
	}

	s.quote.audit(ctx, order.QuotationID, "SUBSCRIPTION_CHANGED", actor,
		fmt.Sprintf("%s: qty %s to %s (%s of %s)", result.Kind, line.Qty, newQty, result.Amount, result.Kind),
		map[string]any{"line_id": lineID, "old_qty": line.Qty.String(), "new_qty": newQty.String()})

	if header, err := s.quote.Header(ctx, order.QuotationID); err == nil {
		_, _ = s.quote.Recalculate(ctx, actor, header)
	}

	view, err := s.view(ctx, orderID)
	if err != nil {
		return SubscriptionChangeResult{}, err
	}
	return SubscriptionChangeResult{View: view, Proration: result, CreditNote: creditNote}, nil
}
