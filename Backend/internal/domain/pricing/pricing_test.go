package pricing_test

import (
	"testing"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/domain/pricing"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

func line(qty, price, cost, disc string) pricing.LineInput {
	return pricing.LineInput{
		Qty:             d(qty),
		UnitPrice:       d(price),
		UnitCost:        d(cost),
		LineDiscountPct: d(disc),
		TaxRatePct:      decimal.Zero,
		LineType:        pricing.LineOneTime,
	}
}

func TestEffectiveDiscountComposesMultiplicatively(t *testing.T) {
	for _, tc := range []struct{ linePct, orderPct, want string }{
		{"0", "0", "0"},
		{"10", "0", "10"},
		{"0", "20", "20"},  // the hole a rep would exploit
		{"10", "10", "19"}, // not 20 — the second discount applies to 90%
		{"50", "50", "75"},
		{"100", "50", "100"},
	} {
		got := pricing.EffectiveDiscountPct(d(tc.linePct), d(tc.orderPct))
		if !got.Equal(d(tc.want)) {
			t.Errorf("Effective(line=%s, order=%s) = %s, want %s",
				tc.linePct, tc.orderPct, got, tc.want)
		}
	}
}

func TestOrderDiscountCannotHideBehindZeroLineDiscounts(t *testing.T) {
	// A rep setting every line to 0% and 20% on the order must still surface
	// a 20% effective discount, because that is what governance scores.
	lines := []pricing.LineInput{
		line("1", "100000", "60000", "0"),
		line("1", "50000", "30000", "0"),
	}

	got := pricing.Compute(lines, d("20"))

	for i, l := range got.Lines {
		if !l.EffectiveDiscountPct.Equal(d("20")) {
			t.Errorf("line %d effective discount = %s, want 20", i, l.EffectiveDiscountPct)
		}
	}
	if !got.DiscountTotal.Equal(d("30000")) {
		t.Errorf("DiscountTotal = %s, want 30000", got.DiscountTotal)
	}
}

func TestLineMathAndMargin(t *testing.T) {
	// 2 x 45000 = 90000 list; 12% off = 10800; net 79200; cost 2 x 30000.
	got := pricing.Compute([]pricing.LineInput{line("2", "45000", "30000", "12")}, decimal.Zero)
	l := got.Lines[0]

	for _, c := range []struct {
		name string
		got  decimal.Decimal
		want string
	}{
		{"ListValue", l.ListValue, "90000"},
		{"DiscountAmount", l.DiscountAmount, "10800"},
		{"NetAmount", l.NetAmount, "79200"},
		{"CostAmount", l.CostAmount, "60000"},
		{"MarginAmount", l.MarginAmount, "19200"},
	} {
		if !c.got.Equal(d(c.want)) {
			t.Errorf("%s = %s, want %s", c.name, c.got, c.want)
		}
	}

	// 19200 / 79200 = 24.242424...%
	if !l.MarginPct.Equal(d("24.242")) {
		t.Errorf("MarginPct = %s, want 24.242", l.MarginPct)
	}
}

func TestTaxAppliesAfterDiscount(t *testing.T) {
	in := line("1", "1000", "500", "10")
	in.TaxRatePct = d("18")

	l := pricing.Compute([]pricing.LineInput{in}, decimal.Zero).Lines[0]

	if !l.NetAmount.Equal(d("900")) {
		t.Fatalf("NetAmount = %s, want 900", l.NetAmount)
	}
	// 18% of 900, not of 1000.
	if !l.TaxAmount.Equal(d("162")) {
		t.Errorf("TaxAmount = %s, want 162 (18%% of the discounted net)", l.TaxAmount)
	}
}

func TestTotalsAreTheSumOfRoundedLines(t *testing.T) {
	// Each line rounds up individually; the total must match what is printed.
	lines := []pricing.LineInput{
		line("1", "10.005", "5", "0"),
		line("1", "10.005", "5", "0"),
		line("1", "10.005", "5", "0"),
	}

	got := pricing.Compute(lines, decimal.Zero)

	if !got.ListSubtotal.Equal(d("30.03")) {
		t.Errorf("ListSubtotal = %s, want 30.03 (sum of rounded lines)", got.ListSubtotal)
	}
}

func TestOneTimeAndRecurringAreTrackedSeparately(t *testing.T) {
	// A single order carrying both tracks is the hybrid billing requirement.
	hw := line("1", "40000", "25000", "0")

	sub := line("3", "5000", "2000", "0")
	sub.LineType = pricing.LineRecurring

	got := pricing.Compute([]pricing.LineInput{hw, sub}, decimal.Zero)

	if !got.OneTimeTotal.Equal(d("40000")) {
		t.Errorf("OneTimeTotal = %s, want 40000", got.OneTimeTotal)
	}
	if !got.RecurringTotal.Equal(d("15000")) {
		t.Errorf("RecurringTotal = %s, want 15000", got.RecurringTotal)
	}
	if !got.NetSubtotal.Equal(d("55000")) {
		t.Errorf("NetSubtotal = %s, want 55000", got.NetSubtotal)
	}
}

func TestEmptyQuotationIsZeroNotUndefined(t *testing.T) {
	got := pricing.Compute(nil, decimal.Zero)

	if !got.GrandTotal.IsZero() || !got.MarginPct.IsZero() {
		t.Errorf("empty order = total %s margin %s, want zeros", got.GrandTotal, got.MarginPct)
	}
	if got.Lines == nil {
		t.Error("Lines is nil; it should be an empty slice so JSON renders []")
	}
}

func TestZeroNetDoesNotDivideByZero(t *testing.T) {
	// 100% discount leaves nothing to compute a margin ratio against.
	got := pricing.Compute([]pricing.LineInput{line("1", "1000", "500", "100")}, decimal.Zero)

	if !got.Lines[0].NetAmount.IsZero() {
		t.Fatalf("NetAmount = %s, want 0", got.Lines[0].NetAmount)
	}
	if !got.Lines[0].MarginPct.IsZero() {
		t.Errorf("MarginPct = %s, want 0 for a zero net", got.Lines[0].MarginPct)
	}
}

func TestLineTypeDefaultsToOneTime(t *testing.T) {
	in := line("1", "100", "50", "0")
	in.LineType = ""

	if got := pricing.Compute([]pricing.LineInput{in}, decimal.Zero).Lines[0].LineType; got != pricing.LineOneTime {
		t.Errorf("LineType = %q, want ONETIME", got)
	}
}
