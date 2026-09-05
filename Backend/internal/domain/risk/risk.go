// Package risk decides whether a quotation needs approval, and from whom.
//
// The problem statement calls this the "blended discount risk score". Its
// purpose is to catch two different kinds of over-discounting with one
// number:
//
//   - one line badly over its own ceiling, even when the order looks fine
//     overall (their worked example: a Gold customer is allowed 15%, but a
//     thin-margin Service line is only allowed 10% and got 18%);
//
//   - many lines each slightly over, none alarming alone, which together
//     give away real margin.
//
// A single-line check catches the first and misses the second. An order-wide
// average catches the second and dilutes the first. So the engine computes
// both — a value-weighted blended score and the worst single line — and
// routes on whichever is more demanding.
//
// The routing thresholds are data, not constants: they come from policies the
// admin edits. The problem statement requires these rules to be real
// application logic rather than hardcoded values.
package risk

import (
	"fmt"
	"sort"
	"strings"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
)

// Tier is the customer's commercial tier, which sets their base ceiling.
type Tier string

const (
	TierBronze Tier = "BRONZE"
	TierSilver Tier = "SILVER"
	TierGold   Tier = "GOLD"
)

// Level is how far up the chain a quotation must travel before it can be
// confirmed.
type Level string

const (
	LevelNone           Level = "NONE"
	LevelManager        Level = "MANAGER"
	LevelManagerFinance Level = "MANAGER_FINANCE"
)

// rank orders levels so the most demanding matching policy wins.
func (l Level) rank() int {
	switch l {
	case LevelManagerFinance:
		return 2
	case LevelManager:
		return 1
	default:
		return 0
	}
}

// Policy is one configurable routing rule. A policy matches when either
// threshold is met, so the two detection mechanisms are independent.
type Policy struct {
	ID              int64
	Name            string
	MinBlended      decimal.Decimal // matches when blended >= this
	MinLineOverage  decimal.Decimal // matches when the worst line >= this
	RequiresManager bool
	RequiresFinance bool
}

// Level is the approval level this policy demands.
func (p Policy) Level() Level {
	switch {
	case p.RequiresFinance:
		return LevelManagerFinance
	case p.RequiresManager:
		return LevelManager
	default:
		return LevelNone
	}
}

// Config is the governance configuration a quotation is scored against. In
// production it is loaded once into the config cache and passed in, so
// scoring a quotation costs zero database reads.
type Config struct {
	// TierCeilingPct is the base discount ceiling per customer tier.
	TierCeilingPct map[Tier]decimal.Decimal

	// CategoryCeilingPct optionally tightens the ceiling for a product
	// category. A category absent from this map imposes no extra limit.
	CategoryCeilingPct map[int64]decimal.Decimal

	// Policies are the routing rules. Order does not matter; the most
	// demanding match wins.
	Policies []Policy
}

// LineInput is one quotation line as governance sees it.
type LineInput struct {
	LineID       int64
	ProductID    int64
	ProductName  string
	CategoryID   int64
	CategoryName string

	// GivenPct must be the EFFECTIVE discount from the pricing engine, with
	// any order-level discount already composed in. Passing the raw line
	// discount here would let a rep hide behind an order-level discount.
	GivenPct decimal.Decimal

	// ListValue is the pre-discount value of the line. It weights the blended
	// score so a large line counts for more than a small one.
	ListValue decimal.Decimal
}

// LineBreakdown explains one line's contribution. It renders directly as the
// "Why This Quote Was Flagged" table, so the score and the explanation always
// come from the same computation and cannot drift apart.
type LineBreakdown struct {
	LineID       int64
	ProductID    int64
	ProductName  string
	CategoryName string

	GivenPct   decimal.Decimal
	AllowedPct decimal.Decimal
	OveragePts decimal.Decimal
	ListValue  decimal.Decimal
	IsOver     bool
}

// Result is the engine's verdict.
type Result struct {
	BlendedScore   decimal.Decimal
	MaxLineOverage decimal.Decimal
	RequiredLevel  Level

	// MatchedPolicyID is the policy that set RequiredLevel, or 0 when no
	// approval is needed. Recorded on the quotation for auditability.
	MatchedPolicyID int64

	Breakdown []LineBreakdown

	// Rationale is a human sentence for the approval screen's callout.
	Rationale string
}

// Score evaluates a quotation against the governance configuration.
//
// It never returns an error: an empty quotation, an unknown tier, and a
// missing policy set are all legitimate states that simply require no
// approval. A quotation builder that errors while the rep is typing is worse
// than one that reports "nothing to approve yet".
func Score(lines []LineInput, tier Tier, cfg Config) Result {
	res := Result{
		BlendedScore:   money.Zero(),
		MaxLineOverage: money.Zero(),
		RequiredLevel:  LevelNone,
		Breakdown:      make([]LineBreakdown, 0, len(lines)),
	}

	tierCeiling, hasTier := cfg.TierCeilingPct[tier]
	if !hasTier {
		// An unconfigured tier is treated as allowing nothing, so a
		// misconfiguration routes deals to a human rather than silently
		// approving them.
		tierCeiling = money.Zero()
	}

	weightedOverage := money.Zero()
	totalValue := money.Zero()

	for _, l := range lines {
		allowed := tierCeiling
		if catCeiling, ok := cfg.CategoryCeilingPct[l.CategoryID]; ok {
			allowed = money.Min(allowed, catCeiling)
		}

		overage := money.RoundPct(money.ClampNonNegative(l.GivenPct.Sub(allowed)))

		res.Breakdown = append(res.Breakdown, LineBreakdown{
			LineID:       l.LineID,
			ProductID:    l.ProductID,
			ProductName:  l.ProductName,
			CategoryName: l.CategoryName,
			GivenPct:     money.RoundPct(l.GivenPct),
			AllowedPct:   money.RoundPct(allowed),
			OveragePts:   overage,
			ListValue:    l.ListValue,
			IsOver:       overage.IsPositive(),
		})

		weightedOverage = weightedOverage.Add(overage.Mul(l.ListValue))
		totalValue = totalValue.Add(l.ListValue)
		res.MaxLineOverage = money.Max(res.MaxLineOverage, overage)
	}

	res.BlendedScore = money.RoundPct(money.SafeDiv(weightedOverage, totalValue))

	res.RequiredLevel, res.MatchedPolicyID = route(res.BlendedScore, res.MaxLineOverage, cfg.Policies)
	res.Rationale = rationale(res)

	return res
}

// route picks the most demanding policy whose thresholds are met.
func route(blended, maxLine decimal.Decimal, policies []Policy) (Level, int64) {
	best := LevelNone
	var bestID int64

	// Sort by ID so that two policies demanding the same level resolve
	// deterministically, which keeps audit records stable across runs.
	sorted := make([]Policy, len(policies))
	copy(sorted, policies)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	for _, p := range sorted {
		matched := (p.MinBlended.IsPositive() && blended.GreaterThanOrEqual(p.MinBlended)) ||
			(p.MinLineOverage.IsPositive() && maxLine.GreaterThanOrEqual(p.MinLineOverage))
		if !matched {
			continue
		}
		if lvl := p.Level(); lvl.rank() > best.rank() {
			best, bestID = lvl, p.ID
		}
	}
	return best, bestID
}

func rationale(r Result) string {
	if r.RequiredLevel == LevelNone {
		return "Every line is within its discount ceiling. No approval required."
	}

	var over []string
	for _, b := range r.Breakdown {
		if b.IsOver {
			over = append(over, fmt.Sprintf("%s is %s pts over its %s%% limit",
				b.ProductName, b.OveragePts, b.AllowedPct))
		}
	}

	switch len(over) {
	case 0:
		// Reachable only if a policy has a zero-ish threshold; keep it honest.
		return fmt.Sprintf("Blended discount risk is %s pts across the order.", r.BlendedScore)
	case 1:
		return fmt.Sprintf("%s. Blended risk across the order is %s pts.",
			capitalise(over[0]), r.BlendedScore)
	default:
		return fmt.Sprintf(
			"%d lines exceed their ceilings (%s). Individually small, they blend to %s pts across the order.",
			len(over), strings.Join(over, "; "), r.BlendedScore)
	}
}

func capitalise(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
