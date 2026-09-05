// Package billing turns recurring quotation lines into a billing schedule and
// computes the proration owed when a subscription changes mid-cycle.
//
// The problem statement requires one order to carry both one-off products and
// recurring subscription lines, billed correctly and separately. This package
// owns the recurring half.
//
// Proration is day-count based: change the quantity halfway through a period
// and you pay for half the period. It is the rule a customer can verify on an
// invoice without a spreadsheet, which is the point.
package billing

import (
	"math"
	"time"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
)

// Period is how often a subscription bills.
type Period string

const (
	PeriodMonthly   Period = "MONTHLY"
	PeriodQuarterly Period = "QUARTERLY"
	PeriodYearly    Period = "YEARLY"
)

// Advance returns the end of a period starting at t. The returned instant is
// exclusive: it is the start of the next period, so consecutive rows meet
// with no gap and no overlap.
func (p Period) Advance(t time.Time) time.Time {
	switch p {
	case PeriodQuarterly:
		return t.AddDate(0, 3, 0)
	case PeriodYearly:
		return t.AddDate(1, 0, 0)
	default:
		return t.AddDate(0, 1, 0)
	}
}

// Valid reports whether p is a period this system bills on.
func (p Period) Valid() bool {
	switch p {
	case PeriodMonthly, PeriodQuarterly, PeriodYearly:
		return true
	default:
		return false
	}
}

// ScheduleInput describes a recurring line to lay out over time.
type ScheduleInput struct {
	QuotationLineID int64
	Period          Period
	UnitPrice       decimal.Decimal
	Qty             int64
	StartDate       time.Time
	Cycles          int
}

// ScheduleRow is one future invoice.
type ScheduleRow struct {
	QuotationLineID int64
	Seq             int // 1-based
	PeriodStart     time.Time
	PeriodEnd       time.Time // exclusive
	Amount          decimal.Decimal

	// ProrationFactor is 1 for a whole period. Generated rows are always
	// whole periods; the field exists so a prorated adjustment row written
	// later carries the same shape.
	ProrationFactor decimal.Decimal
}

// GenerateSchedule lays out Cycles consecutive billing periods.
//
// Periods are contiguous by construction — each row starts exactly where the
// previous ended — so a monthly subscription beginning on the 31st does not
// silently skip a month or double-bill February.
func GenerateSchedule(in ScheduleInput) []ScheduleRow {
	if in.Cycles <= 0 || in.Qty <= 0 || !in.Period.Valid() {
		return []ScheduleRow{}
	}

	amount := money.RoundAmount(in.UnitPrice.Mul(decimal.NewFromInt(in.Qty)))
	one := decimal.NewFromInt(1)

	rows := make([]ScheduleRow, 0, in.Cycles)
	start := in.StartDate

	for seq := 1; seq <= in.Cycles; seq++ {
		end := in.Period.Advance(start)
		rows = append(rows, ScheduleRow{
			QuotationLineID: in.QuotationLineID,
			Seq:             seq,
			PeriodStart:     start,
			PeriodEnd:       end,
			Amount:          amount,
			ProrationFactor: one,
		})
		start = end
	}
	return rows
}

// Kind distinguishes money owed to us from money owed back to the customer.
type Kind string

const (
	// KindCharge is an extra amount added to the next invoice.
	KindCharge Kind = "CHARGE"
	// KindCredit is an amount returned as a credit note.
	KindCredit Kind = "CREDIT"
	// KindNone means the change had no financial effect.
	KindNone Kind = "NONE"
)

// ProrationInput describes a mid-cycle quantity change.
type ProrationInput struct {
	ChangeDate  time.Time
	PeriodStart time.Time
	PeriodEnd   time.Time // exclusive

	// DeltaQty is positive when seats are added, negative when removed.
	DeltaQty  int64
	UnitPrice decimal.Decimal
}

// ProrationResult is the computed adjustment. Amount is always non-negative;
// Kind carries the direction, which keeps invoice and credit-note rendering
// from having to reason about signs.
type ProrationResult struct {
	DaysInPeriod  int
	DaysRemaining int
	Factor        decimal.Decimal
	Amount        decimal.Decimal
	Kind          Kind
}

// FactorScale is the precision the *displayed* proration factor is rounded
// to. The amount is always computed from the exact ratio, never from this
// rounded value.
const FactorScale int32 = 4

// Prorate computes what a mid-cycle quantity change costs or refunds.
//
//	factor = days remaining / days in period
//	amount = |delta| x unit price x factor
//
// A change on the first day charges the full period; a change on or after the
// last day charges nothing. Dates outside the period are clamped rather than
// producing a negative charge.
func Prorate(in ProrationInput) ProrationResult {
	res := ProrationResult{
		Factor: money.Zero(),
		Amount: money.Zero(),
		Kind:   KindNone,
	}

	daysInPeriod := wholeDays(in.PeriodStart, in.PeriodEnd)
	if daysInPeriod <= 0 || in.DeltaQty == 0 {
		return res
	}
	res.DaysInPeriod = daysInPeriod

	remaining := wholeDays(in.ChangeDate, in.PeriodEnd)
	switch {
	case remaining < 0:
		remaining = 0 // change landed after the period closed
	case remaining > daysInPeriod:
		remaining = daysInPeriod // change landed before the period opened
	}
	res.DaysRemaining = remaining

	// Keep the exact ratio for the money and round only what is displayed.
	// Rounding the factor first and then multiplying would put the invoice
	// tens of paise away from what the customer computes by hand.
	exactFactor := decimal.NewFromInt(int64(remaining)).
		Div(decimal.NewFromInt(int64(daysInPeriod)))
	res.Factor = exactFactor.Round(FactorScale)

	qty := in.DeltaQty
	if qty < 0 {
		qty = -qty
		res.Kind = KindCredit
	} else {
		res.Kind = KindCharge
	}

	res.Amount = money.RoundAmount(
		in.UnitPrice.Mul(decimal.NewFromInt(qty)).Mul(exactFactor),
	)

	if res.Amount.IsZero() {
		res.Kind = KindNone
	}
	return res
}

// wholeDays counts the days between two instants.
//
// The remaining span is rounded up, because a customer who changes their
// subscription at ten in the morning has the new quantity for the rest of
// that day and should be billed for it. Truncating would quietly give away a
// day on every mid-day change; a full period is a full period.
func wholeDays(from, to time.Time) int {
	return int(math.Ceil(to.Sub(from).Hours() / 24))
}
