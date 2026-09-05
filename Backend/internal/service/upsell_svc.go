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
	"dealflow360/backend/internal/platform/logger"
	"dealflow360/backend/internal/platform/recommender"
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

// Recommender ranks products worth offering alongside a cart.
//
// It is an interface rather than a concrete client so the engine stays
// optional: a nil Recommender is the supported configuration, and the
// rules-based ranking below is what runs then.
type Recommender interface {
	Suggest(ctx context.Context, quotationID int64, productIDs []int64, topN int) ([]recommender.Suggestion, error)
}

// WithRecommender attaches the recommendation engine and returns the service,
// so it can be chained onto NewQuoteService at wiring time.
func (s *QuoteService) WithRecommender(r Recommender) *QuoteService {
	s.rec = r
	return s
}

// Upsells ranks products worth suggesting for a quotation.
//
// Two sources, one contract. The recommendation engine ranks by co-purchase
// strength learned from confirmed quotations; the upsell_rules table ranks by
// hand-curated pairings. The engine is preferred when it is configured and
// answers, and the rules are what run otherwise — including when the engine
// is down, slow, or has nothing for this mix. Either way the caller gets the
// same shape, and every price and margin figure below is computed here from
// the current catalogue rather than taken from the engine's response.
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

	if s.rec != nil {
		out, err := s.engineUpsells(ctx, quote, inCart, limit)
		switch {
		case err != nil:
			// The panel is an aside on the page. An engine that is down must
			// cost a rep the enrichment, never the quotation.
			logger.From(ctx).Warn("recommendation engine unavailable, falling back to upsell rules",
				"quotation_id", quotationID, "error", err)
		case len(out) > 0:
			return out, nil
		}
	}

	return s.ruleUpsells(ctx, quote, inCart, limit)
}

// engineUpsells turns the engine's ranked product ids into priced suggestions.
//
// The engine decides the order; this decides the money. Nothing the engine
// reports about price or margin is carried across, so a stale co-purchase
// matrix can never put a wrong number in front of a rep.
func (s *QuoteService) engineUpsells(ctx context.Context, quote Quotation, inCart []int64, limit int) ([]Suggestion, error) {
	ranked, err := s.rec.Suggest(ctx, quote.Header.ID, inCart, limit)
	if err != nil {
		return nil, err
	}
	if len(ranked) == 0 {
		return nil, nil
	}

	ids := make([]int64, 0, len(ranked))
	for _, r := range ranked {
		ids = append(ids, r.ProductID)
	}

	rows, err := s.q.GetProductsByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load recommended products: %w", err)
	}
	byID := make(map[int64]sqlcgen.GetProductsByIDsRow, len(rows))
	for _, r := range rows {
		byID[r.ID] = r
	}

	cart := make(map[int64]struct{}, len(inCart))
	for _, id := range inCart {
		cart[id] = struct{}{}
	}

	baseline := quote.Totals.MarginPct
	existing := toPricingInputs(quote.Lines)

	out := make([]Suggestion, 0, len(ranked))
	for _, r := range ranked {
		p, ok := byID[r.ProductID]
		// A product the engine still remembers may since have been delisted,
		// or already added to the cart while the response was in flight.
		if !ok || !p.IsActive {
			continue
		}
		if _, inCart := cart[r.ProductID]; inCart {
			continue
		}

		unitMargin, pctDelta := s.marginImpact(quote, existing, baseline, p.ID, p.CategoryID, p.UnitPrice, p.UnitCost)

		out = append(out, Suggestion{
			ProductID: p.ID, Name: p.Name, SKU: p.Sku,
			UnitPrice: p.UnitPrice, IsPromoted: p.IsPromoted,
			// Confidence is P(candidate | anchor) from the co-purchase matrix,
			// which is what "score" means for an engine-ranked suggestion.
			Score:          r.Confidence,
			MarginDelta:    unitMargin,
			MarginPctDelta: pctDelta,
		})
		if limit > 0 && len(out) == limit {
			break
		}
	}
	return out, nil
}

// ruleUpsells ranks from the hand-curated upsell_rules pairings.
func (s *QuoteService) ruleUpsells(ctx context.Context, quote Quotation, inCart []int64, limit int) ([]Suggestion, error) {
	rows, err := s.q.SuggestUpsells(ctx, inCart)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("suggest upsells: %w", err))
	}

	baseline := quote.Totals.MarginPct
	existing := toPricingInputs(quote.Lines)

	out := make([]Suggestion, 0, len(rows))
	for _, r := range rows {
		// A suggestion whose own margin is below the configured floor is not
		// worth putting in front of a rep, however often it co-purchases.
		if r.UnitPrice.IsPositive() {
			pct := money.RoundPct(money.SafeDiv(r.UnitPrice.Sub(r.UnitCost), r.UnitPrice).Mul(money.Hundred))
			if pct.LessThan(r.MinMarginPct) {
				continue
			}
		}

		unitMargin, pctDelta := s.marginImpact(quote, existing, baseline, r.ID, r.CategoryID, r.UnitPrice, r.UnitCost)

		out = append(out, Suggestion{
			ProductID: r.ID, Name: r.Name, SKU: r.Sku,
			UnitPrice: r.UnitPrice, IsPromoted: r.IsPromoted, Score: r.Score,
			MarginDelta:    unitMargin,
			MarginPctDelta: pctDelta,
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

// marginImpact prices the order as it would be with one unit of a candidate
// added, so the delta reflects the real effect on this deal rather than the
// product in isolation.
func (s *QuoteService) marginImpact(
	quote Quotation,
	existing []pricing.LineInput,
	baseline decimal.Decimal,
	productID, categoryID int64,
	unitPrice, unitCost decimal.Decimal,
) (unitMargin, pctDelta decimal.Decimal) {
	withLine := append(append([]pricing.LineInput(nil), existing...), pricing.LineInput{
		ProductID:  productID,
		CategoryID: categoryID,
		Qty:        decimal.NewFromInt(1),
		UnitPrice:  unitPrice,
		UnitCost:   unitCost,
		LineType:   pricing.LineOneTime,
	})
	projected := pricing.Compute(withLine, quote.Header.OrderDiscountPct)

	return money.RoundAmount(unitPrice.Sub(unitCost)),
		money.RoundPct(projected.MarginPct.Sub(baseline))
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
