package money_test

import (
	"testing"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

func TestRoundAmountIsHalfUp(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"1.234", "1.23"},
		{"1.235", "1.24"},
		{"1.236", "1.24"},
		{"0.005", "0.01"},
		{"99.999", "100"},
		{"1234.5", "1234.5"},
	} {
		if got := money.RoundAmount(d(tc.in)); !got.Equal(d(tc.want)) {
			t.Errorf("RoundAmount(%s) = %s, want %s", tc.in, got, tc.want)
		}
	}
}

func TestSumOfRoundedLinesNotRoundedSum(t *testing.T) {
	// Three lines that each round up. Rounding the sum gives a different
	// answer from summing the rounded lines, and the invoice must agree
	// with the lines printed above it.
	raw := []string{"10.005", "10.005", "10.005"}

	rounded := make([]decimal.Decimal, 0, len(raw))
	total := decimal.Zero
	for _, r := range raw {
		rounded = append(rounded, money.RoundAmount(d(r)))
		total = total.Add(d(r))
	}

	sumOfRounded := money.Sum(rounded...)
	roundedSum := money.RoundAmount(total)

	if !sumOfRounded.Equal(d("30.03")) {
		t.Errorf("sum of rounded lines = %s, want 30.03", sumOfRounded)
	}
	if !roundedSum.Equal(d("30.02")) {
		t.Errorf("rounded sum = %s, want 30.02 (the wrong answer we avoid)", roundedSum)
	}
	if sumOfRounded.Equal(roundedSum) {
		t.Fatal("the two strategies agreed; this test can no longer detect the bug")
	}
}

func TestPctOfDoesNotRoundEarly(t *testing.T) {
	// 18% of 1050.55 is 189.0990. Rounding early would lose the 0.099.
	got := money.PctOf(d("1050.55"), d("18"))
	if !got.Equal(d("189.099")) {
		t.Errorf("PctOf = %s, want 189.099", got)
	}
	if r := money.RoundAmount(got); !r.Equal(d("189.10")) {
		t.Errorf("RoundAmount(PctOf) = %s, want 189.10", r)
	}
}

func TestSafeDivHandlesZeroDenominator(t *testing.T) {
	if got := money.SafeDiv(d("10"), decimal.Zero); !got.IsZero() {
		t.Errorf("SafeDiv(10, 0) = %s, want 0", got)
	}
	if got := money.SafeDiv(d("10"), d("4")); !got.Equal(d("2.5")) {
		t.Errorf("SafeDiv(10, 4) = %s, want 2.5", got)
	}
}

func TestClampNonNegative(t *testing.T) {
	if got := money.ClampNonNegative(d("-3")); !got.IsZero() {
		t.Errorf("ClampNonNegative(-3) = %s, want 0", got)
	}
	if got := money.ClampNonNegative(d("3")); !got.Equal(d("3")) {
		t.Errorf("ClampNonNegative(3) = %s, want 3", got)
	}
}

func TestMinMax(t *testing.T) {
	if got := money.Min(d("10"), d("15")); !got.Equal(d("10")) {
		t.Errorf("Min = %s, want 10", got)
	}
	if got := money.Max(d("10"), d("15")); !got.Equal(d("15")) {
		t.Errorf("Max = %s, want 15", got)
	}
}
