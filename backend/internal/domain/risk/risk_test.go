package risk_test

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/domain/risk"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

const (
	catHardware int64 = 1
	catService  int64 = 2
)

// defaultConfig mirrors the seeded governance configuration:
// Bronze 5%, Silver 10%, Gold 15%; Hardware 15%, Services 10% (thin margins).
//
// Two policies. The first sends anything over a ceiling to a manager. The
// second escalates to finance when the order-wide blend reaches 5 points or a
// single line is 10 points out.
func defaultConfig() risk.Config {
	return risk.Config{
		TierCeilingPct: map[risk.Tier]decimal.Decimal{
			risk.TierBronze: d("5"),
			risk.TierSilver: d("10"),
			risk.TierGold:   d("15"),
		},
		CategoryCeilingPct: map[int64]decimal.Decimal{
			catHardware: d("15"),
			catService:  d("10"),
		},
		Policies: []risk.Policy{
			{
				ID: 1, Name: "Any breach needs a manager",
				MinBlended: d("0.001"), MinLineOverage: d("0.001"),
				RequiresManager: true,
			},
			{
				ID: 2, Name: "High risk needs finance",
				MinBlended: d("5"), MinLineOverage: d("10"),
				RequiresManager: true, RequiresFinance: true,
			},
		},
	}
}

// TestSpecSection10 reproduces the worked example from section 10 of the
// problem statement, exactly as written:
//
//	A Gold customer is normally allowed up to 15 percent discount. But within
//	that same order Hardware items are allowed up to 15 percent, while Service
//	items are allowed only up to 10 percent.
//
//	  Laptop (Hardware):     12% given, 15% allowed -> this line is fine
//	  Setup Service (Svc):   18% given, 10% allowed -> 8 points over its limit
//
//	Even though the customer is Gold and 15 percent sounds fine on paper, the
//	Service line broke its own stricter limit. So the whole quotation gets
//	flagged for approval, because of that one line.
//
// The line values are the ones behind the 5.6 blended score on the approval
// mockup: 45,000 of hardware and 105,000 of services.
func TestSpecSection10(t *testing.T) {
	lines := []risk.LineInput{
		{
			ProductName: "Laptop", CategoryID: catHardware, CategoryName: "Hardware",
			GivenPct: d("12"), ListValue: d("45000"),
		},
		{
			ProductName: "Setup Service", CategoryID: catService, CategoryName: "Services",
			GivenPct: d("18"), ListValue: d("105000"),
		},
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	// The hardware line is inside both its tier and category ceilings.
	if hw := got.Breakdown[0]; hw.IsOver || !hw.AllowedPct.Equal(d("15")) || !hw.OveragePts.IsZero() {
		t.Errorf("Laptop: allowed=%s over=%s isOver=%v, want allowed=15 over=0 isOver=false",
			hw.AllowedPct, hw.OveragePts, hw.IsOver)
	}

	// The service line breaks the stricter category ceiling by 8 points.
	svc := got.Breakdown[1]
	if !svc.AllowedPct.Equal(d("10")) {
		t.Errorf("Setup Service allowed = %s, want 10 (category is stricter than tier)", svc.AllowedPct)
	}
	if !svc.OveragePts.Equal(d("8")) {
		t.Errorf("Setup Service overage = %s, want 8", svc.OveragePts)
	}
	if !svc.IsOver {
		t.Error("Setup Service should be flagged as over its limit")
	}

	// 8 points on 105,000 of a 150,000 order blends to 5.6.
	if !got.BlendedScore.Equal(d("5.6")) {
		t.Errorf("BlendedScore = %s, want 5.6", got.BlendedScore)
	}
	if !got.MaxLineOverage.Equal(d("8")) {
		t.Errorf("MaxLineOverage = %s, want 8", got.MaxLineOverage)
	}

	// 5.6 reaches the finance threshold of 5.
	if got.RequiredLevel != risk.LevelManagerFinance {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE", got.RequiredLevel)
	}
	if got.MatchedPolicyID != 2 {
		t.Errorf("MatchedPolicyID = %d, want 2", got.MatchedPolicyID)
	}
	if got.Rationale == "" {
		t.Error("Rationale is empty; the approval screen needs a sentence to show")
	}
}

// The other half of the section 10 argument: no single line looks alarming,
// but together they have given away real margin.
func TestDeathByAThousandCuts(t *testing.T) {
	equal := d("100000")
	lines := []risk.LineInput{
		{ProductName: "A", CategoryID: catHardware, GivenPct: d("19"), ListValue: equal}, // 4 over
		{ProductName: "B", CategoryID: catHardware, GivenPct: d("20"), ListValue: equal}, // 5 over
		{ProductName: "C", CategoryID: catHardware, GivenPct: d("21"), ListValue: equal}, // 6 over
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	if !got.BlendedScore.Equal(d("5")) {
		t.Errorf("BlendedScore = %s, want 5", got.BlendedScore)
	}
	if !got.MaxLineOverage.Equal(d("6")) {
		t.Errorf("MaxLineOverage = %s, want 6", got.MaxLineOverage)
	}
	// No line reaches the 10-point single-line trigger, so only the blended
	// score can catch this. That is the mechanism's whole reason to exist.
	if got.MaxLineOverage.GreaterThanOrEqual(d("10")) {
		t.Fatal("a line hit the single-line trigger; this test no longer proves the blend works")
	}
	if got.RequiredLevel != risk.LevelManagerFinance {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE from the blended score alone", got.RequiredLevel)
	}
}

func TestSmallSpreadBreachesStopAtManager(t *testing.T) {
	equal := d("100000")
	lines := []risk.LineInput{
		{CategoryID: catHardware, GivenPct: d("17"), ListValue: equal}, // 2 over
		{CategoryID: catHardware, GivenPct: d("18"), ListValue: equal}, // 3 over
		{CategoryID: catHardware, GivenPct: d("17"), ListValue: equal}, // 2 over
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	if !got.BlendedScore.Equal(d("2.333")) {
		t.Errorf("BlendedScore = %s, want 2.333", got.BlendedScore)
	}
	if got.RequiredLevel != risk.LevelManager {
		t.Errorf("RequiredLevel = %s, want MANAGER (below the finance threshold)", got.RequiredLevel)
	}
}

// Value weighting must not let a trivial line drag a large order to finance,
// but the single-line trigger must still catch a severe breach.
func TestTinyLineCannotDragTheOrderButIsStillCaught(t *testing.T) {
	lines := []risk.LineInput{
		{ProductName: "Bulk hardware", CategoryID: catHardware, GivenPct: d("15"), ListValue: d("500000")},
		{ProductName: "Cable", CategoryID: catHardware, GivenPct: d("35"), ListValue: d("500")},
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	// 20 points on 500 of a 500,500 order barely moves the blend.
	if got.BlendedScore.GreaterThan(d("0.1")) {
		t.Errorf("BlendedScore = %s, want a negligible value (weighting is broken)", got.BlendedScore)
	}
	if !got.MaxLineOverage.Equal(d("20")) {
		t.Errorf("MaxLineOverage = %s, want 20", got.MaxLineOverage)
	}
	// The blend alone would wave this through, so the single-line trigger has
	// to be what escalates it.
	if got.RequiredLevel != risk.LevelManagerFinance {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE from the single-line trigger", got.RequiredLevel)
	}
}

func TestCompliantQuotationNeedsNoApproval(t *testing.T) {
	lines := []risk.LineInput{
		{CategoryID: catHardware, GivenPct: d("12"), ListValue: d("45000")},
		{CategoryID: catService, GivenPct: d("8"), ListValue: d("20000")},
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	if !got.BlendedScore.IsZero() || !got.MaxLineOverage.IsZero() {
		t.Errorf("blended=%s max=%s, want zeros", got.BlendedScore, got.MaxLineOverage)
	}
	if got.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s, want NONE", got.RequiredLevel)
	}
	if got.MatchedPolicyID != 0 {
		t.Errorf("MatchedPolicyID = %d, want 0 when nothing matched", got.MatchedPolicyID)
	}
	if !strings.Contains(got.Rationale, "No approval required") {
		t.Errorf("Rationale = %q, want it to say no approval is required", got.Rationale)
	}
}

func TestCeilingIsTheStricterOfTierAndCategory(t *testing.T) {
	cfg := defaultConfig()

	// Category stricter than tier: Gold 15, Services 10 -> 10 wins.
	got := risk.Score([]risk.LineInput{
		{CategoryID: catService, GivenPct: d("12"), ListValue: d("1000")},
	}, risk.TierGold, cfg)
	if !got.Breakdown[0].AllowedPct.Equal(d("10")) {
		t.Errorf("Gold+Services allowed = %s, want 10", got.Breakdown[0].AllowedPct)
	}

	// Tier stricter than category: Bronze 5, Hardware 15 -> 5 wins.
	got = risk.Score([]risk.LineInput{
		{CategoryID: catHardware, GivenPct: d("10"), ListValue: d("1000")},
	}, risk.TierBronze, cfg)
	if !got.Breakdown[0].AllowedPct.Equal(d("5")) {
		t.Errorf("Bronze+Hardware allowed = %s, want 5", got.Breakdown[0].AllowedPct)
	}
	if !got.Breakdown[0].OveragePts.Equal(d("5")) {
		t.Errorf("overage = %s, want 5", got.Breakdown[0].OveragePts)
	}
}

func TestCategoryWithoutCeilingFallsBackToTier(t *testing.T) {
	const catUnconfigured int64 = 99

	got := risk.Score([]risk.LineInput{
		{CategoryID: catUnconfigured, GivenPct: d("14"), ListValue: d("1000")},
	}, risk.TierGold, defaultConfig())

	if !got.Breakdown[0].AllowedPct.Equal(d("15")) {
		t.Errorf("allowed = %s, want the tier ceiling of 15", got.Breakdown[0].AllowedPct)
	}
	if got.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s, want NONE", got.RequiredLevel)
	}
}

func TestUnknownTierFailsClosed(t *testing.T) {
	// A misconfigured tier must route to a human, never silently approve.
	got := risk.Score([]risk.LineInput{
		{CategoryID: catHardware, GivenPct: d("1"), ListValue: d("1000")},
	}, risk.Tier("PLATINUM"), defaultConfig())

	if !got.Breakdown[0].AllowedPct.IsZero() {
		t.Errorf("allowed = %s, want 0 for an unknown tier", got.Breakdown[0].AllowedPct)
	}
	if got.RequiredLevel == risk.LevelNone {
		t.Error("an unknown tier was waved through; it must fail closed")
	}
}

func TestEmptyQuotationDoesNotDivideByZero(t *testing.T) {
	got := risk.Score(nil, risk.TierGold, defaultConfig())

	if !got.BlendedScore.IsZero() {
		t.Errorf("BlendedScore = %s, want 0", got.BlendedScore)
	}
	if got.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s, want NONE", got.RequiredLevel)
	}
	if got.Breakdown == nil {
		t.Error("Breakdown is nil; it should be empty so JSON renders []")
	}
}

func TestZeroValueLinesDoNotBreakTheBlend(t *testing.T) {
	// A free line still has a discount percentage but contributes no weight.
	got := risk.Score([]risk.LineInput{
		{CategoryID: catService, GivenPct: d("50"), ListValue: decimal.Zero},
	}, risk.TierGold, defaultConfig())

	if !got.BlendedScore.IsZero() {
		t.Errorf("BlendedScore = %s, want 0 when total value is zero", got.BlendedScore)
	}
	// The line is still visibly over, so the single-line trigger applies.
	if !got.MaxLineOverage.Equal(d("40")) {
		t.Errorf("MaxLineOverage = %s, want 40", got.MaxLineOverage)
	}
	if got.RequiredLevel != risk.LevelManagerFinance {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE", got.RequiredLevel)
	}
}

func TestNoPoliciesMeansNoApproval(t *testing.T) {
	cfg := defaultConfig()
	cfg.Policies = nil

	got := risk.Score([]risk.LineInput{
		{CategoryID: catService, GivenPct: d("90"), ListValue: d("1000")},
	}, risk.TierGold, cfg)

	if got.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s, want NONE when no policies are configured", got.RequiredLevel)
	}
}

func TestBreakdownIsRenderableAsTheFlaggedTable(t *testing.T) {
	// The approval screen's "Why This Quote Was Flagged" table is built from
	// this breakdown, so score and explanation can never disagree.
	lines := []risk.LineInput{
		{ProductName: "Laptop", CategoryName: "Hardware", CategoryID: catHardware, GivenPct: d("12"), ListValue: d("45000")},
		{ProductName: "Setup Service", CategoryName: "Services", CategoryID: catService, GivenPct: d("18"), ListValue: d("105000")},
	}

	got := risk.Score(lines, risk.TierGold, defaultConfig())

	if len(got.Breakdown) != len(lines) {
		t.Fatalf("Breakdown has %d rows, want %d (one per line)", len(got.Breakdown), len(lines))
	}
	for i, b := range got.Breakdown {
		if b.ProductName == "" || b.CategoryName == "" {
			t.Errorf("row %d is missing labels: %+v", i, b)
		}
	}
}
