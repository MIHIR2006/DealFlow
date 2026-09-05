// Package money holds the service's decimal helpers and, more importantly,
// its rounding policy.
//
// The policy exists in exactly one place so that a quotation total computed
// in the builder, re-computed on approval, and rendered on an invoice can
// never disagree by a paisa. float64 is never used for money anywhere in
// this codebase.
package money

import "github.com/shopspring/decimal"

// AmountScale is the number of decimal places money is stored and displayed
// with. It matches NUMERIC(14,2) in Postgres.
const AmountScale int32 = 2

// PctScale is the number of decimal places percentages carry. It matches
// NUMERIC(6,3), which is enough for a discount like 12.345%.
const PctScale int32 = 3

// Hundred is a frequently needed constant for percentage arithmetic.
var Hundred = decimal.NewFromInt(100)

// Zero returns a zero amount.
func Zero() decimal.Decimal { return decimal.Zero }

// FromInt builds an amount from a whole number.
func FromInt(i int64) decimal.Decimal { return decimal.NewFromInt(i) }

// FromString parses a decimal string such as "1234.56".
func FromString(s string) (decimal.Decimal, error) { return decimal.NewFromString(s) }

// MustFromString is FromString for literals known to be valid. It panics on a
// malformed input, so use it only in tests, seeds, and constant tables.
func MustFromString(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic("money: invalid decimal literal " + s + ": " + err.Error())
	}
	return d
}

// RoundAmount rounds to the money scale, half away from zero — which is
// half-up for the non-negative amounts this system deals in.
//
// Apply this at every line, then sum the rounded lines. Never round a sum:
// that is how a total ends up one paisa away from the lines above it.
func RoundAmount(d decimal.Decimal) decimal.Decimal { return d.Round(AmountScale) }

// RoundPct rounds to the percentage scale.
func RoundPct(d decimal.Decimal) decimal.Decimal { return d.Round(PctScale) }

// PctOf returns amount x pct/100, unrounded. The caller decides when to round,
// because rounding an intermediate value loses precision the final rounding
// would have kept.
func PctOf(amount, pct decimal.Decimal) decimal.Decimal {
	return amount.Mul(pct).Div(Hundred)
}

// Sum adds values with no intermediate rounding.
func Sum(vals ...decimal.Decimal) decimal.Decimal {
	total := decimal.Zero
	for _, v := range vals {
		total = total.Add(v)
	}
	return total
}

// Max returns the larger of a and b.
func Max(a, b decimal.Decimal) decimal.Decimal {
	if a.GreaterThan(b) {
		return a
	}
	return b
}

// Min returns the smaller of a and b.
func Min(a, b decimal.Decimal) decimal.Decimal {
	if a.LessThan(b) {
		return a
	}
	return b
}

// ClampNonNegative returns d, or zero when d is negative. Overages and
// remaining quantities are never negative.
func ClampNonNegative(d decimal.Decimal) decimal.Decimal {
	if d.IsNegative() {
		return decimal.Zero
	}
	return d
}

// SafeDiv returns a/b, or zero when b is zero. Used for ratios such as margin
// percentage where an empty denominator means "no signal", not an error.
func SafeDiv(a, b decimal.Decimal) decimal.Decimal {
	if b.IsZero() {
		return decimal.Zero
	}
	return a.Div(b)
}
