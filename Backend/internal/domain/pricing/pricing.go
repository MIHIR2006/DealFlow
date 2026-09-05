// Package pricing computes line totals, margins, and order rollups.
//
// It is the only place that knows how a line-level discount and an
// order-level discount combine. That composition matters: without it a rep
// can set every line to 0% and put 20% on the order, and a naive risk check
// that only looks at line discounts sees nothing wrong.
package pricing

import (
	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
)

// LineType distinguishes a one-off sale from a recurring subscription line.
// A single order may carry both, which is what makes billing hybrid.
type LineType string

const (
	LineOneTime   LineType = "ONETIME"
	LineRecurring LineType = "RECURRING"
)

// LineInput is one row of a quotation as the caller knows it.
type LineInput struct {
	LineID     int64
	ProductID  int64
	CategoryID int64

	Qty       decimal.Decimal
	UnitPrice decimal.Decimal // list price before any discount
	UnitCost  decimal.Decimal // what it costs us; drives margin

	LineDiscountPct decimal.Decimal // 0-100, applied to this line only
	TaxRatePct      decimal.Decimal // 0-100, applied after discount

	LineType LineType
	PlanID   *int64 // set for RECURRING lines
}

// LineResult is the computed form of a line. Every monetary field is already
// rounded to the money scale.
type LineResult struct {
	LineID     int64
	ProductID  int64
	CategoryID int64

	// ListValue is qty x unitPrice before discount. It is the weight the risk
	// engine uses, so that a large line counts for more than a small one.
	ListValue decimal.Decimal

	// EffectiveDiscountPct is the line discount composed with the order
	// discount. This, not LineDiscountPct, is what governance scores.
	EffectiveDiscountPct decimal.Decimal

	DiscountAmount decimal.Decimal
	NetAmount      decimal.Decimal // after discount, before tax
	TaxAmount      decimal.Decimal
	CostAmount     decimal.Decimal
	MarginAmount   decimal.Decimal
	MarginPct      decimal.Decimal

	LineType LineType
}

// OrderTotals is the rollup of a whole quotation.
type OrderTotals struct {
	Lines []LineResult

	ListSubtotal  decimal.Decimal
	DiscountTotal decimal.Decimal
	NetSubtotal   decimal.Decimal
	TaxTotal      decimal.Decimal
	GrandTotal    decimal.Decimal

	CostTotal    decimal.Decimal
	MarginAmount decimal.Decimal
	MarginPct    decimal.Decimal

	// OneTimeTotal and RecurringTotal split the net subtotal by line type so
	// the billing screen can show the two tracks separately.
	OneTimeTotal   decimal.Decimal
	RecurringTotal decimal.Decimal
}

// EffectiveDiscountPct composes a line discount with an order discount.
//
//	effective = 1 - (1 - line) x (1 - order)
//
// The two are multiplicative, not additive: 10% off a line and then 10% off
// the order is 19%, not 20%. Discounts stack on the already-discounted price,
// which is how a customer would compute it and how the invoice must read.
func EffectiveDiscountPct(linePct, orderPct decimal.Decimal) decimal.Decimal {
	one := decimal.NewFromInt(1)
	lineRemainder := one.Sub(linePct.Div(money.Hundred))
	orderRemainder := one.Sub(orderPct.Div(money.Hundred))
	effective := one.Sub(lineRemainder.Mul(orderRemainder))
	return money.RoundPct(effective.Mul(money.Hundred))
}

// Compute prices every line and rolls the order up.
//
// Order totals are the sum of already-rounded lines, never a rounded sum, so
// the printed total always equals the printed lines.
func Compute(lines []LineInput, orderDiscountPct decimal.Decimal) OrderTotals {
	out := OrderTotals{
		Lines:          make([]LineResult, 0, len(lines)),
		ListSubtotal:   money.Zero(),
		DiscountTotal:  money.Zero(),
		NetSubtotal:    money.Zero(),
		TaxTotal:       money.Zero(),
		GrandTotal:     money.Zero(),
		CostTotal:      money.Zero(),
		MarginAmount:   money.Zero(),
		MarginPct:      money.Zero(),
		OneTimeTotal:   money.Zero(),
		RecurringTotal: money.Zero(),
	}

	for _, in := range lines {
		r := computeLine(in, orderDiscountPct)
		out.Lines = append(out.Lines, r)

		out.ListSubtotal = out.ListSubtotal.Add(r.ListValue)
		out.DiscountTotal = out.DiscountTotal.Add(r.DiscountAmount)
		out.NetSubtotal = out.NetSubtotal.Add(r.NetAmount)
		out.TaxTotal = out.TaxTotal.Add(r.TaxAmount)
		out.CostTotal = out.CostTotal.Add(r.CostAmount)

		if r.LineType == LineRecurring {
			out.RecurringTotal = out.RecurringTotal.Add(r.NetAmount)
		} else {
			out.OneTimeTotal = out.OneTimeTotal.Add(r.NetAmount)
		}
	}

	out.GrandTotal = out.NetSubtotal.Add(out.TaxTotal)
	out.MarginAmount = out.NetSubtotal.Sub(out.CostTotal)
	out.MarginPct = money.RoundPct(
		money.SafeDiv(out.MarginAmount, out.NetSubtotal).Mul(money.Hundred),
	)

	return out
}

func computeLine(in LineInput, orderDiscountPct decimal.Decimal) LineResult {
	listValue := money.RoundAmount(in.Qty.Mul(in.UnitPrice))
	effPct := EffectiveDiscountPct(in.LineDiscountPct, orderDiscountPct)

	discount := money.RoundAmount(money.PctOf(listValue, effPct))
	net := listValue.Sub(discount)
	tax := money.RoundAmount(money.PctOf(net, in.TaxRatePct))
	cost := money.RoundAmount(in.Qty.Mul(in.UnitCost))
	margin := net.Sub(cost)

	lineType := in.LineType
	if lineType == "" {
		lineType = LineOneTime
	}

	return LineResult{
		LineID:               in.LineID,
		ProductID:            in.ProductID,
		CategoryID:           in.CategoryID,
		ListValue:            listValue,
		EffectiveDiscountPct: effPct,
		DiscountAmount:       discount,
		NetAmount:            net,
		TaxAmount:            tax,
		CostAmount:           cost,
		MarginAmount:         margin,
		MarginPct:            money.RoundPct(money.SafeDiv(margin, net).Mul(money.Hundred)),
		LineType:             lineType,
	}
}
