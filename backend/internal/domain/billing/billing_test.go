package billing_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/billing"
	"dealflow360/backend/internal/domain/money"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

func day(y int, m time.Month, dd int) time.Time {
	return time.Date(y, m, dd, 0, 0, 0, 0, time.UTC)
}

// A 30-day period used by the proration examples.
var (
	periodStart = day(2026, time.June, 1)
	periodEnd   = day(2026, time.July, 1)
)

func TestProrateIncreaseHalfwayThroughPeriod(t *testing.T) {
	// Two seats added on day 15 of a 30-day period, at 5,000 each.
	// Half the period remains, so half the price is charged.
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  day(2026, time.June, 16),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    2,
		UnitPrice:   d("5000"),
	})

	if got.DaysInPeriod != 30 {
		t.Errorf("DaysInPeriod = %d, want 30", got.DaysInPeriod)
	}
	if got.DaysRemaining != 15 {
		t.Errorf("DaysRemaining = %d, want 15", got.DaysRemaining)
	}
	if !got.Factor.Equal(d("0.5")) {
		t.Errorf("Factor = %s, want 0.5", got.Factor)
	}
	if !got.Amount.Equal(d("5000")) {
		t.Errorf("Amount = %s, want 5000", got.Amount)
	}
	if got.Kind != billing.KindCharge {
		t.Errorf("Kind = %s, want CHARGE", got.Kind)
	}
}

func TestProrateDecreaseProducesACredit(t *testing.T) {
	// One seat removed on day 10 of a 30-day period leaves 20 days unused.
	// 5000 x 20/30 = 3333.33 exactly. Computing from the rounded 0.6667
	// factor instead would give 3333.50, which a customer checking the
	// invoice by hand would flag.
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  day(2026, time.June, 11),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    -1,
		UnitPrice:   d("5000"),
	})

	if got.DaysRemaining != 20 {
		t.Errorf("DaysRemaining = %d, want 20", got.DaysRemaining)
	}
	if !got.Factor.Equal(d("0.6667")) {
		t.Errorf("Factor = %s, want 0.6667", got.Factor)
	}
	if !got.Amount.Equal(d("3333.33")) {
		t.Errorf("Amount = %s, want 3333.33 (computed from the exact ratio)", got.Amount)
	}
	if got.Kind != billing.KindCredit {
		t.Errorf("Kind = %s, want CREDIT", got.Kind)
	}
}

func TestProrateAtPeriodStartChargesTheWholePeriod(t *testing.T) {
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  periodStart,
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    1,
		UnitPrice:   d("5000"),
	})

	if !got.Factor.Equal(d("1")) {
		t.Errorf("Factor = %s, want 1", got.Factor)
	}
	if !got.Amount.Equal(d("5000")) {
		t.Errorf("Amount = %s, want the full 5000", got.Amount)
	}
}

func TestProrateAtPeriodEndChargesNothing(t *testing.T) {
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  periodEnd,
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    1,
		UnitPrice:   d("5000"),
	})

	if !got.Factor.IsZero() || !got.Amount.IsZero() {
		t.Errorf("factor=%s amount=%s, want zeros", got.Factor, got.Amount)
	}
	if got.Kind != billing.KindNone {
		t.Errorf("Kind = %s, want NONE for a zero adjustment", got.Kind)
	}
}

func TestProrateClampsDatesOutsideThePeriod(t *testing.T) {
	// After the period closed: nothing owed, never a negative charge.
	after := billing.Prorate(billing.ProrationInput{
		ChangeDate:  day(2026, time.August, 1),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    1,
		UnitPrice:   d("5000"),
	})
	if after.DaysRemaining != 0 || after.Amount.IsNegative() {
		t.Errorf("late change: days=%d amount=%s, want 0 and non-negative",
			after.DaysRemaining, after.Amount)
	}

	// Before the period opened: the whole period, never more than it.
	before := billing.Prorate(billing.ProrationInput{
		ChangeDate:  day(2026, time.May, 1),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    1,
		UnitPrice:   d("5000"),
	})
	if before.DaysRemaining != 30 {
		t.Errorf("early change: DaysRemaining = %d, want it clamped to 30", before.DaysRemaining)
	}
	if !before.Amount.Equal(d("5000")) {
		t.Errorf("early change: Amount = %s, want 5000", before.Amount)
	}
}

func TestProrateZeroDeltaIsANoOp(t *testing.T) {
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  day(2026, time.June, 15),
		PeriodStart: periodStart,
		PeriodEnd:   periodEnd,
		DeltaQty:    0,
		UnitPrice:   d("5000"),
	})

	if got.Kind != billing.KindNone || !got.Amount.IsZero() {
		t.Errorf("kind=%s amount=%s, want NONE and 0", got.Kind, got.Amount)
	}
}

func TestProrateInvalidPeriodIsSafe(t *testing.T) {
	got := billing.Prorate(billing.ProrationInput{
		ChangeDate:  periodStart,
		PeriodStart: periodEnd,
		PeriodEnd:   periodStart, // inverted
		DeltaQty:    1,
		UnitPrice:   d("5000"),
	})

	if !got.Amount.IsZero() || got.Kind != billing.KindNone {
		t.Errorf("amount=%s kind=%s, want a zero no-op", got.Amount, got.Kind)
	}
}

func TestGenerateMonthlySchedule(t *testing.T) {
	// Three seats at 5,000 a month for a year.
	rows := billing.GenerateSchedule(billing.ScheduleInput{
		QuotationLineID: 42,
		Period:          billing.PeriodMonthly,
		UnitPrice:       d("5000"),
		Qty:             3,
		StartDate:       day(2026, time.June, 1),
		Cycles:          12,
	})

	if len(rows) != 12 {
		t.Fatalf("rows = %d, want 12", len(rows))
	}
	for i, r := range rows {
		if !r.Amount.Equal(d("15000")) {
			t.Errorf("row %d amount = %s, want 15000", i, r.Amount)
		}
		if r.Seq != i+1 {
			t.Errorf("row %d Seq = %d, want %d", i, r.Seq, i+1)
		}
		if r.QuotationLineID != 42 {
			t.Errorf("row %d lost its line id", i)
		}
		if !r.ProrationFactor.Equal(d("1")) {
			t.Errorf("row %d factor = %s, want 1 for a whole period", i, r.ProrationFactor)
		}
	}
	if !rows[0].PeriodStart.Equal(day(2026, time.June, 1)) {
		t.Errorf("first period starts %v, want 2026-06-01", rows[0].PeriodStart)
	}
	if !rows[11].PeriodEnd.Equal(day(2027, time.June, 1)) {
		t.Errorf("last period ends %v, want 2027-06-01", rows[11].PeriodEnd)
	}
}

func TestSchedulePeriodsAreContiguous(t *testing.T) {
	// Starting on the 31st is the case that exposes naive month arithmetic:
	// consecutive rows must still meet exactly, with no gap and no overlap.
	for _, start := range []time.Time{
		day(2026, time.January, 31),
		day(2026, time.August, 31),
		day(2026, time.February, 28),
	} {
		rows := billing.GenerateSchedule(billing.ScheduleInput{
			Period:    billing.PeriodMonthly,
			UnitPrice: d("1000"),
			Qty:       1,
			StartDate: start,
			Cycles:    14,
		})

		for i := 0; i < len(rows)-1; i++ {
			if !rows[i].PeriodEnd.Equal(rows[i+1].PeriodStart) {
				t.Errorf("start %v: row %d ends %v but row %d starts %v",
					start.Format("2006-01-02"), i, rows[i].PeriodEnd,
					i+1, rows[i+1].PeriodStart)
			}
			if !rows[i].PeriodEnd.After(rows[i].PeriodStart) {
				t.Errorf("start %v: row %d has a non-positive span", start.Format("2006-01-02"), i)
			}
		}
	}
}

func TestGenerateQuarterlyAndYearlySchedules(t *testing.T) {
	q := billing.GenerateSchedule(billing.ScheduleInput{
		Period: billing.PeriodQuarterly, UnitPrice: d("30000"), Qty: 1,
		StartDate: day(2026, time.January, 1), Cycles: 4,
	})
	if len(q) != 4 {
		t.Fatalf("quarterly rows = %d, want 4", len(q))
	}
	if !q[3].PeriodEnd.Equal(day(2027, time.January, 1)) {
		t.Errorf("4 quarters end %v, want 2027-01-01", q[3].PeriodEnd)
	}

	y := billing.GenerateSchedule(billing.ScheduleInput{
		Period: billing.PeriodYearly, UnitPrice: d("100000"), Qty: 1,
		StartDate: day(2026, time.January, 1), Cycles: 2,
	})
	if !y[1].PeriodEnd.Equal(day(2028, time.January, 1)) {
		t.Errorf("2 years end %v, want 2028-01-01", y[1].PeriodEnd)
	}
}

func TestGenerateScheduleRejectsNonsenseInput(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   billing.ScheduleInput
	}{
		{"zero cycles", billing.ScheduleInput{Period: billing.PeriodMonthly, Qty: 1, Cycles: 0}},
		{"negative cycles", billing.ScheduleInput{Period: billing.PeriodMonthly, Qty: 1, Cycles: -3}},
		{"zero quantity", billing.ScheduleInput{Period: billing.PeriodMonthly, Qty: 0, Cycles: 12}},
		{"unknown period", billing.ScheduleInput{Period: billing.Period("WEEKLY"), Qty: 1, Cycles: 12}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows := billing.GenerateSchedule(tc.in)
			if len(rows) != 0 {
				t.Errorf("rows = %d, want none", len(rows))
			}
			if rows == nil {
				t.Error("rows is nil; it should be empty so JSON renders []")
			}
		})
	}
}

func TestPeriodAdvance(t *testing.T) {
	base := day(2026, time.March, 15)
	for _, tc := range []struct {
		p    billing.Period
		want time.Time
	}{
		{billing.PeriodMonthly, day(2026, time.April, 15)},
		{billing.PeriodQuarterly, day(2026, time.June, 15)},
		{billing.PeriodYearly, day(2027, time.March, 15)},
	} {
		if got := tc.p.Advance(base); !got.Equal(tc.want) {
			t.Errorf("%s.Advance = %v, want %v", tc.p, got, tc.want)
		}
	}
}
