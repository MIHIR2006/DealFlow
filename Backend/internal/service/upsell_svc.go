package service

import (
	"context"
	"fmt"
	"sort"

	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/domain/pricing"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
)

// Suggestion is a product worth offering alongside what is already in the
// cart, with what adding it would do to the deal.
//
// The margin figures are the point. A rep can see that a suggestion improves
// the deal before adding it, rather than discovering afterwards that a
// low-margin add-on dragged the order down.
type Suggestion struct {
	ProductID  int64
	Name       string
	SKU        string
	UnitPrice  decimal.Decimal
	IsPromoted bool
	Score      decimal.Decimal

	// MarginDelta is how much margin one unit adds in absolute terms.
	MarginDelta decimal.Decimal

	// MarginPctDelta is how the order's overall margin percentage moves.
	// A healthy product can still dilute a healthier order.
	MarginPctDelta decimal.Decimal
}

// Upsells ranks products worth suggesting for a quotation.
func (s *QuoteService) Upsells(ctx context.Context, actor auth.Principal, quotationID int64, limit int) ([]Suggestion, error) {
	quote, err := s.Get(ctx, actor, quotationID)
	if err != nil {
		return nil, err
	}
	if len(quote.Lines) == 0 {
		// Nothing in the cart, nothing to pair with.
		return []Suggestion{}, nil
	}

	inCart := make([]int64, 0, len(quote.Lines))
	for _, l := range quote.Lines {
		inCart = append(inCart, l.ProductID)
	}

	rows, err := s.q.SuggestUpsells(ctx, inCart)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("suggest upsells: %w", err))
	}

	baseline := quote.Totals.MarginPct
	existing := toPricingInputs(quote.Lines)

	out := make([]Suggestion, 0, len(rows))
	for _, r := range rows {
		unitMargin := r.UnitPrice.Sub(r.UnitCost)

		// A suggestion whose own margin is below the configured floor is not
		// worth putting in front of a rep, however often it co-purchases.
		if r.UnitPrice.IsPositive() {
			pct := money.RoundPct(money.SafeDiv(unitMargin, r.UnitPrice).Mul(money.Hundred))
			if pct.LessThan(r.MinMarginPct) {
				continue
			}
		}

		// Price the order as it would be with this line added, so the delta
		// reflects the real effect rather than the product in isolation.
		withLine := append(append([]pricing.LineInput(nil), existing...), pricing.LineInput{
			ProductID:  r.ID,
			CategoryID: r.CategoryID,
			Qty:        decimal.NewFromInt(1),
			UnitPrice:  r.UnitPrice,
			UnitCost:   r.UnitCost,
			LineType:   pricing.LineOneTime,
		})
		projected := pricing.Compute(withLine, quote.Header.OrderDiscountPct)

		out = append(out, Suggestion{
			ProductID: r.ID, Name: r.Name, SKU: r.Sku,
			UnitPrice: r.UnitPrice, IsPromoted: r.IsPromoted, Score: r.Score,
			MarginDelta:    money.RoundAmount(unitMargin),
			MarginPctDelta: money.RoundPct(projected.MarginPct.Sub(baseline)),
		})
	}

	// Promoted products first, then co-purchase strength, then margin. The
	// tie-break on id keeps the panel from reshuffling between keystrokes.
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.IsPromoted != b.IsPromoted {
			return a.IsPromoted
		}
		if c := b.Score.Cmp(a.Score); c != 0 {
			return c < 0
		}
		if c := b.MarginDelta.Cmp(a.MarginDelta); c != 0 {
			return c < 0
		}
		return a.ProductID < b.ProductID
	})

	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func toPricingInputs(lines []sqlcgen.ListQuotationLinesRow) []pricing.LineInput {
	out := make([]pricing.LineInput, 0, len(lines))
	for _, l := range lines {
		out = append(out, pricing.LineInput{
			LineID:          l.ID,
			ProductID:       l.ProductID,
			CategoryID:      l.CategoryID,
			Qty:             l.Qty,
			UnitPrice:       l.UnitPrice,
			UnitCost:        l.UnitCost,
			LineDiscountPct: l.LineDiscountPct,
			TaxRatePct:      l.TaxRatePct,
			LineType:        pricing.LineType(l.LineType),
			PlanID:          l.PlanID,
		})
	}
	return out
}
