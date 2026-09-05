package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/billing"
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// BillingService turns a confirmed order into money owed.
//
// One order carries two billing tracks. The one-time lines become a single
// invoice due now. The recurring lines become a schedule of future periods,
// each of which becomes its own invoice when its time comes. Keeping them
// separate is the point: a customer buying laptops and a support plan should
// see one bill for the hardware and a predictable monthly one for the plan,
// not a blended figure neither party can reconcile.
type BillingService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewBillingService builds the service.
func NewBillingService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *BillingService {
	return &BillingService{pool: pool, q: q, quote: quote}
}

// PaymentTermDays is how long a one-time invoice has to be settled.
const PaymentTermDays = 30

// Billing is everything owed on an order.
type Billing struct {
	OrderID     int64
	Invoices    []sqlcgen.Invoice
	Schedules   []sqlcgen.ListBillingSchedulesForOrderRow
	CreditNotes []sqlcgen.CreditNote
}

// Generate creates the invoices and schedule for a confirmed order.
func (s *BillingService) Generate(ctx context.Context, actor auth.Principal, orderID int64) (Billing, error) {
	order, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Billing{}, apierr.NotFound("order not found")
		}
		return Billing{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return Billing{}, err
	}

	existing, err := s.q.ListInvoicesForOrder(ctx, orderID)
	if err != nil {
		return Billing{}, apierr.Internal(fmt.Errorf("list invoices: %w", err))
	}
	if len(existing) > 0 {
		return Billing{}, apierr.Conflict("this order has already been billed")
	}

	lines, err := s.q.ListQuotationLines(ctx, order.QuotationID)
	if err != nil {
		return Billing{}, apierr.Internal(fmt.Errorf("list lines: %w", err))
	}
	if len(lines) == 0 {
		return Billing{}, apierr.Validation("this order has nothing to bill")
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if err := s.generateOneTimeInvoice(ctx, qtx, orderID, lines); err != nil {
			return err
		}
		if err := s.generateSchedules(ctx, qtx, orderID, lines); err != nil {
			return err
		}

		if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
			ID: orderID, Status: "INVOICED",
		}); err != nil {
			return fmt.Errorf("update order status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Billing{}, apiErr
		}
		return Billing{}, apierr.Internal(err)
	}

	s.audit(ctx, order.QuotationID, "INVOICED", actor,
		"One-time invoice raised and recurring schedule generated",
		map[string]any{"sales_order_id": orderID})

	return s.Get(ctx, actor, orderID)
}

// generateOneTimeInvoice raises a single invoice for the non-recurring lines.
func (s *BillingService) generateOneTimeInvoice(
	ctx context.Context, qtx *sqlcgen.Queries, orderID int64,
	lines []sqlcgen.ListQuotationLinesRow,
) error {
	var oneTime []sqlcgen.ListQuotationLinesRow
	for _, l := range lines {
		if l.LineType == "ONETIME" {
			oneTime = append(oneTime, l)
		}
	}
	// An order of nothing but subscriptions has no invoice due today, only a
	// schedule. That is a legitimate shape, not an error.
	if len(oneTime) == 0 {
		return nil
	}

	subtotal, tax := money.Zero(), money.Zero()
	for _, l := range oneTime {
		subtotal = subtotal.Add(l.NetAmount)
		tax = tax.Add(l.TaxAmount)
	}

	ref, err := qtx.NextInvoiceReference(ctx)
	if err != nil {
		return fmt.Errorf("next invoice reference: %w", err)
	}

	issue := time.Now()
	due := issue.AddDate(0, 0, PaymentTermDays)

	invoice, err := qtx.CreateInvoice(ctx, sqlcgen.CreateInvoiceParams{
		Reference:    ref,
		SalesOrderID: orderID,
		Kind:         "ONETIME",
		Status:       "POSTED",
		IssueDate:    issue,
		DueDate:      &due,
		Subtotal:     subtotal,
		TaxTotal:     tax,
		Total:        subtotal.Add(tax),
	})
	if err != nil {
		return fmt.Errorf("create invoice: %w", err)
	}

	rows := make([]sqlcgen.InsertInvoiceLinesParams, 0, len(oneTime))
	for _, l := range oneTime {
		productID := l.ProductID
		rows = append(rows, sqlcgen.InsertInvoiceLinesParams{
			InvoiceID:   invoice.ID,
			ProductID:   &productID,
			Description: l.ProductName,
			Qty:         l.Qty,
			UnitPrice:   l.UnitPrice,
			NetAmount:   l.NetAmount,
			TaxAmount:   l.TaxAmount,
		})
	}
	if _, err := qtx.InsertInvoiceLines(ctx, rows); err != nil {
		return fmt.Errorf("insert invoice lines: %w", err)
	}
	return nil
}

// generateSchedules lays out the future periods for each recurring line.
func (s *BillingService) generateSchedules(
	ctx context.Context, qtx *sqlcgen.Queries, orderID int64,
	lines []sqlcgen.ListQuotationLinesRow,
) error {
	start := startOfToday()
	rows := make([]sqlcgen.InsertBillingSchedulesParams, 0, 16)

	for _, l := range lines {
		if l.LineType != "RECURRING" || l.PlanID == nil {
			continue
		}

		period := billing.PeriodMonthly
		cycles := int(12)
		if l.PlanPeriod != nil {
			period = billing.Period(*l.PlanPeriod)
		}
		if l.PlanCycles != nil {
			cycles = int(*l.PlanCycles)
		}

		// The schedule prices the line at its discounted net, so a discount
		// negotiated once applies to every period rather than only the first.
		unit := money.SafeDiv(l.NetAmount, l.Qty)

		for _, r := range billing.GenerateSchedule(billing.ScheduleInput{
			QuotationLineID: l.ID,
			Period:          period,
			UnitPrice:       unit,
			Qty:             l.Qty.IntPart(),
			StartDate:       start,
			Cycles:          cycles,
		}) {
			rows = append(rows, sqlcgen.InsertBillingSchedulesParams{
				SalesOrderID:    orderID,
				QuotationLineID: l.ID,
				PlanID:          *l.PlanID,
				Seq:             int32(r.Seq), //nolint:gosec // bounded by plan cycles
				PeriodStart:     r.PeriodStart,
				PeriodEnd:       r.PeriodEnd,
				Amount:          r.Amount,
				ProrationFactor: r.ProrationFactor,
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

// Get returns everything owed on an order.
func (s *BillingService) Get(ctx context.Context, actor auth.Principal, orderID int64) (Billing, error) {
	order, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Billing{}, apierr.NotFound("order not found")
		}
		return Billing{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return Billing{}, err
	}

	invoices, err := s.q.ListInvoicesForOrder(ctx, orderID)
	if err != nil {
		return Billing{}, apierr.Internal(fmt.Errorf("list invoices: %w", err))
	}
	schedules, err := s.q.ListBillingSchedulesForOrder(ctx, orderID)
	if err != nil {
		return Billing{}, apierr.Internal(fmt.Errorf("list schedules: %w", err))
	}
	notes, err := s.q.ListCreditNotesForOrder(ctx, orderID)
	if err != nil {
		return Billing{}, apierr.Internal(fmt.Errorf("list credit notes: %w", err))
	}

	return Billing{
		OrderID: orderID, Invoices: invoices,
		Schedules: schedules, CreditNotes: notes,
	}, nil
}

// PaymentInput records money received.
type PaymentInput struct {
	InvoiceID int64
	Amount    decimal.Decimal
	Method    string
	Reference string
}

// RecordPayment books a payment against an invoice.
//
// The invoice's paid amount and status are recomputed from the payments
// actually on the ledger rather than incremented, so the two can never drift.
// A short payment lands on PARTIAL, not PAID.
func (s *BillingService) RecordPayment(ctx context.Context, actor auth.Principal, in PaymentInput) (sqlcgen.Invoice, error) {
	if in.Amount.LessThanOrEqual(decimal.Zero) {
		return sqlcgen.Invoice{}, apierr.Validation("amount must be greater than zero")
	}
	switch in.Method {
	case "CASH", "BANK":
	default:
		return sqlcgen.Invoice{}, apierr.Validation("method must be CASH or BANK")
	}

	invoice, err := s.q.GetInvoice(ctx, in.InvoiceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.Invoice{}, apierr.NotFound("invoice not found")
		}
		return sqlcgen.Invoice{}, apierr.Internal(fmt.Errorf("get invoice: %w", err))
	}

	order, err := s.q.GetSalesOrder(ctx, invoice.SalesOrderID)
	if err != nil {
		return sqlcgen.Invoice{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return sqlcgen.Invoice{}, err
	}

	if invoice.Status == "CANCELLED" {
		return sqlcgen.Invoice{}, apierr.Conflict("this invoice was cancelled")
	}
	// Overpaying is refused rather than silently accepted: money arriving
	// beyond what is owed is a reconciliation problem, not a payment.
	outstanding := invoice.Total.Sub(invoice.AmountPaid)
	if in.Amount.GreaterThan(outstanding) {
		return sqlcgen.Invoice{}, apierr.Conflict(fmt.Sprintf(
			"only %s is outstanding on this invoice", outstanding.String()))
	}

	var updated sqlcgen.Invoice
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		actorID := actor.UserID
		if _, err := qtx.CreatePayment(ctx, sqlcgen.CreatePaymentParams{
			InvoiceID:  in.InvoiceID,
			Amount:     in.Amount,
			Method:     in.Method,
			Reference:  in.Reference,
			RecordedBy: &actorID,
		}); err != nil {
			return fmt.Errorf("create payment: %w", err)
		}

		row, err := qtx.RecalculateInvoicePayment(ctx, in.InvoiceID)
		if err != nil {
			return fmt.Errorf("recalculate invoice: %w", err)
		}
		updated = row

		if row.Status == "PAID" {
			if err := s.markOrderPaidIfSettled(ctx, qtx, invoice.SalesOrderID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return sqlcgen.Invoice{}, apiErr
		}
		return sqlcgen.Invoice{}, apierr.Internal(err)
	}

	s.audit(ctx, order.QuotationID, "PAYMENT_RECORDED", actor,
		fmt.Sprintf("%s payment of %s against %s; invoice is now %s",
			in.Method, in.Amount, invoice.Reference, updated.Status),
		map[string]any{
			"invoice_id": in.InvoiceID,
			"amount":     in.Amount.String(),
			"status":     updated.Status,
		})

	return updated, nil
}

// markOrderPaidIfSettled moves the order to PAID once nothing is outstanding.
func (s *BillingService) markOrderPaidIfSettled(ctx context.Context, qtx *sqlcgen.Queries, orderID int64) error {
	invoices, err := qtx.ListInvoicesForOrder(ctx, orderID)
	if err != nil {
		return fmt.Errorf("list invoices: %w", err)
	}
	for _, inv := range invoices {
		if inv.Status != "PAID" && inv.Status != "CANCELLED" {
			return nil
		}
	}
	if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
		ID: orderID, Status: "PAID",
	}); err != nil {
		return fmt.Errorf("update order status: %w", err)
	}
	return nil
}

// SubscriptionChange is a mid-cycle quantity change on a recurring line.
type SubscriptionChange struct {
	OrderID int64
	LineID  int64
	NewQty  int64
}

// ChangeResult is what a subscription change cost or refunded.
type ChangeResult struct {
	Proration  billing.ProrationResult
	CreditNote *sqlcgen.CreditNote
	Billing    Billing
}

// ChangeSubscriptionQuantity adjusts a recurring line part way through a
// period.
//
// The customer pays for what they used. Adding seats on day fifteen of a
// thirty-day month costs half a period, and that adjustment lands on the
// current period's invoice. Removing seats produces a credit note for the
// unused remainder. Either way every later period is repriced at the new
// quantity.
func (s *BillingService) ChangeSubscriptionQuantity(ctx context.Context, actor auth.Principal, in SubscriptionChange) (ChangeResult, error) {
	if in.NewQty < 0 {
		return ChangeResult{}, apierr.Validation("qty cannot be negative")
	}

	order, err := s.q.GetSalesOrder(ctx, in.OrderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ChangeResult{}, apierr.NotFound("order not found")
		}
		return ChangeResult{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return ChangeResult{}, err
	}

	line, err := s.q.GetQuotationLine(ctx, sqlcgen.GetQuotationLineParams{
		ID: in.LineID, QuotationID: order.QuotationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ChangeResult{}, apierr.NotFound("line not found on this order")
		}
		return ChangeResult{}, apierr.Internal(fmt.Errorf("get line: %w", err))
	}
	if line.LineType != "RECURRING" {
		return ChangeResult{}, apierr.Validation("only a recurring line has a subscription quantity")
	}

	current, err := s.q.GetCurrentBillingPeriod(ctx, in.LineID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ChangeResult{}, apierr.Conflict(
				"this subscription has no period in progress to prorate against")
		}
		return ChangeResult{}, apierr.Internal(fmt.Errorf("get current period: %w", err))
	}

	oldQty := line.Qty.IntPart()
	delta := in.NewQty - oldQty
	if delta == 0 {
		return ChangeResult{}, apierr.Validation("the quantity is already " + line.Qty.String())
	}

	unit := money.SafeDiv(line.NetAmount, line.Qty)

	prorated := billing.Prorate(billing.ProrationInput{
		ChangeDate:  time.Now(),
		PeriodStart: current.PeriodStart,
		PeriodEnd:   current.PeriodEnd,
		DeltaQty:    delta,
		UnitPrice:   unit,
	})

	newPeriodAmount := money.RoundAmount(unit.Mul(decimal.NewFromInt(in.NewQty)))

	var note *sqlcgen.CreditNote
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		// A cancellation leaves the line alone: it records what was sold, and
		// rewriting it to zero would erase that. Billing stops because the
		// remaining periods are cancelled below, not because the line changed.
		if in.NewQty > 0 {
			if _, err := qtx.UpdateQuotationLineInput(ctx, sqlcgen.UpdateQuotationLineInputParams{
				ID:              in.LineID,
				Qty:             decimal.NewFromInt(in.NewQty),
				LineDiscountPct: line.LineDiscountPct,
			}); err != nil {
				return fmt.Errorf("update line quantity: %w", err)
			}
		}

		// Every period after the current one is repriced. The current one
		// keeps what was already billed and takes the prorated adjustment.
		if _, err := qtx.UpdateScheduleAmountsFrom(ctx, sqlcgen.UpdateScheduleAmountsFromParams{
			QuotationLineID: in.LineID,
			AfterSeq:        current.Seq,
			Amount:          newPeriodAmount,
		}); err != nil {
			return fmt.Errorf("reprice future periods: %w", err)
		}

		switch prorated.Kind {
		case billing.KindCharge:
			if _, err := qtx.AdjustScheduleAmount(ctx, sqlcgen.AdjustScheduleAmountParams{
				ID: current.ID, Delta: prorated.Amount,
			}); err != nil {
				return fmt.Errorf("apply prorated charge: %w", err)
			}

		case billing.KindCredit:
			ref, err := qtx.NextCreditNoteReference(ctx)
			if err != nil {
				return fmt.Errorf("next credit note reference: %w", err)
			}

			scheduleID, lineID, actorID := current.ID, in.LineID, actor.UserID
			row, err := qtx.CreateCreditNote(ctx, sqlcgen.CreateCreditNoteParams{
				Reference:         ref,
				SalesOrderID:      in.OrderID,
				BillingScheduleID: &scheduleID,
				QuotationLineID:   &lineID,
				Amount:            prorated.Amount,
				ProrationFactor:   prorated.Factor,
				Reason: fmt.Sprintf("Reduced from %d to %d with %d of %d days remaining",
					oldQty, in.NewQty, prorated.DaysRemaining, prorated.DaysInPeriod),
				CreatedBy: &actorID,
			})
			if err != nil {
				return fmt.Errorf("create credit note: %w", err)
			}
			note = &row

			// A subscription cancelled outright stops billing entirely.
			if in.NewQty == 0 {
				if _, err := qtx.CancelRemainingSchedules(ctx, in.LineID); err != nil {
					return fmt.Errorf("cancel remaining schedules: %w", err)
				}
			}
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return ChangeResult{}, apiErr
		}
		return ChangeResult{}, apierr.Internal(err)
	}

	action := "SUBSCRIPTION_INCREASED"
	if delta < 0 {
		action = "SUBSCRIPTION_REDUCED"
	}
	s.audit(ctx, order.QuotationID, action, actor,
		fmt.Sprintf("%s from %d to %d; %s of %s at %s of the period",
			line.ProductName, oldQty, in.NewQty,
			lowerKind(prorated.Kind), prorated.Amount, prorated.Factor),
		map[string]any{
			"line_id":          in.LineID,
			"old_qty":          oldQty,
			"new_qty":          in.NewQty,
			"proration_factor": prorated.Factor.String(),
			"amount":           prorated.Amount.String(),
			"kind":             string(prorated.Kind),
		})

	current2, err := s.Get(ctx, actor, in.OrderID)
	if err != nil {
		return ChangeResult{}, err
	}
	return ChangeResult{Proration: prorated, CreditNote: note, Billing: current2}, nil
}

// InvoiceDetail is an invoice with its lines and payments.
type InvoiceDetail struct {
	Invoice  sqlcgen.GetInvoiceRow
	Lines    []sqlcgen.InvoiceLine
	Payments []sqlcgen.Payment
}

// GetInvoice returns one invoice in full.
func (s *BillingService) GetInvoice(ctx context.Context, actor auth.Principal, invoiceID int64) (InvoiceDetail, error) {
	invoice, err := s.q.GetInvoice(ctx, invoiceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InvoiceDetail{}, apierr.NotFound("invoice not found")
		}
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("get invoice: %w", err))
	}

	order, err := s.q.GetSalesOrder(ctx, invoice.SalesOrderID)
	if err != nil {
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, order.QuotationID); err != nil {
		return InvoiceDetail{}, err
	}

	lines, err := s.q.ListInvoiceLines(ctx, invoiceID)
	if err != nil {
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("list invoice lines: %w", err))
	}
	payments, err := s.q.ListPaymentsForInvoice(ctx, invoiceID)
	if err != nil {
		return InvoiceDetail{}, apierr.Internal(fmt.Errorf("list payments: %w", err))
	}

	return InvoiceDetail{Invoice: invoice, Lines: lines, Payments: payments}, nil
}

// ListInvoices returns a page of invoices.
func (s *BillingService) ListInvoices(ctx context.Context, actor auth.Principal, status *string, cursor *int64, limit int32) ([]sqlcgen.ListInvoicesRow, error) {
	if !actor.Role.Is(auth.RoleAdmin, auth.RoleFinance, auth.RoleManager, auth.RoleRep) {
		return nil, apierr.Forbidden("your role cannot view invoices")
	}

	rows, err := s.q.ListInvoices(ctx, sqlcgen.ListInvoicesParams{
		Status: status, Cursor: cursor, PageSize: limit,
	})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list invoices: %w", err))
	}
	return rows, nil
}

func startOfToday() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func lowerKind(k billing.Kind) string {
	switch k {
	case billing.KindCharge:
		return "charge"
	case billing.KindCredit:
		return "credit"
	default:
		return "no adjustment"
	}
}

func (s *BillingService) audit(ctx context.Context, quotationID int64, action string, actor auth.Principal, note string, payload map[string]any) {
	encoded := []byte("{}")
	if payload != nil {
		if b, err := json.Marshal(payload); err == nil {
			encoded = b
		}
	}

	actorID := actor.UserID
	_, _ = s.q.AppendAuditLog(ctx, sqlcgen.AppendAuditLogParams{
		EntityType: "quotation",
		EntityID:   quotationID,
		Action:     action,
		ActorID:    &actorID,
		ActorLabel: actor.Email,
		Note:       note,
		Payload:    encoded,
	})
}
