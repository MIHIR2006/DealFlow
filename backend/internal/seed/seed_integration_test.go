//go:build integration

package seed_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/domain/pricing"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/seed"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

func seeded(t *testing.T) (*db.Pool, *sqlcgen.Queries) {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	pool, err := db.Open(context.Background(), config.Config{
		DatabaseURL: url, DBMaxConns: 4, DBMinConns: 1,
		DBMaxConnLife: time.Hour, DBMaxConnIdle: 30 * time.Minute,
	})
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := seed.RunWith(context.Background(), pool, fixtureSeed); err != nil {
		t.Fatalf("seed.Run: %v", err)
	}
	return pool, sqlcgen.New(pool)
}

// loadRiskConfig builds the governance configuration from the database, the
// same way the config cache will. Proving the engine works off these rows is
// what makes "configurable, not hardcoded" a demonstrable claim.
func loadRiskConfig(t *testing.T, ctx context.Context, q *sqlcgen.Queries) risk.Config {
	t.Helper()

	cfg := risk.Config{
		TierCeilingPct:     map[risk.Tier]decimal.Decimal{},
		CategoryCeilingPct: map[int64]decimal.Decimal{},
	}

	tiers, err := q.ListDiscountTiers(ctx)
	if err != nil {
		t.Fatalf("ListDiscountTiers: %v", err)
	}
	for _, row := range tiers {
		cfg.TierCeilingPct[risk.Tier(row.Tier)] = row.MaxDiscountPct
	}

	ceilings, err := q.ListCategoryCeilings(ctx)
	if err != nil {
		t.Fatalf("ListCategoryCeilings: %v", err)
	}
	for _, row := range ceilings {
		cfg.CategoryCeilingPct[row.CategoryID] = row.MaxDiscountPct
	}

	policies, err := q.ListApprovalPolicies(ctx)
	if err != nil {
		t.Fatalf("ListApprovalPolicies: %v", err)
	}
	for _, p := range policies {
		cfg.Policies = append(cfg.Policies, risk.Policy{
			ID: p.ID, Name: p.Name,
			MinBlended: p.MinBlended, MinLineOverage: p.MinLineOverage,
			RequiresManager: p.RequiresManager, RequiresFinance: p.RequiresFinance,
		})
	}
	return cfg
}

func productBySKU(t *testing.T, ctx context.Context, q *sqlcgen.Queries, sku string) sqlcgen.ListProductsRow {
	t.Helper()

	rows, err := q.ListProducts(ctx, sqlcgen.ListProductsParams{PageSize: 100})
	if err != nil {
		t.Fatalf("ListProducts: %v", err)
	}
	for _, r := range rows {
		if r.Sku == sku {
			return r
		}
	}
	t.Fatalf("product %q not found in seed", sku)
	return sqlcgen.ListProductsRow{}
}

// The section 10 worked example, driven entirely by seeded configuration and
// seeded product prices rather than by constants in the test.
func TestSeededConfigReproducesSpecSection10(t *testing.T) {
	pool, q := seeded(t)
	_ = pool
	ctx := context.Background()

	cfg := loadRiskConfig(t, ctx, q)
	laptop := productBySKU(t, ctx, q, "HW-LAPTOP")
	setup := productBySKU(t, ctx, q, "SV-SETUP")

	// One laptop at 45,000 and seven setup services at 15,000 = 105,000,
	// which are the values behind the 5.6 blended score on the mockup.
	totals := pricing.Compute([]pricing.LineInput{
		{
			ProductID: laptop.ID, CategoryID: laptop.CategoryID,
			Qty: d("1"), UnitPrice: laptop.UnitPrice, UnitCost: laptop.UnitCost,
			LineDiscountPct: d("12"), LineType: pricing.LineOneTime,
		},
		{
			ProductID: setup.ID, CategoryID: setup.CategoryID,
			Qty: d("7"), UnitPrice: setup.UnitPrice, UnitCost: setup.UnitCost,
			LineDiscountPct: d("18"), LineType: pricing.LineOneTime,
		},
	}, decimal.Zero)

	if !totals.Lines[0].ListValue.Equal(d("45000")) {
		t.Fatalf("laptop list value = %s, want 45000", totals.Lines[0].ListValue)
	}
	if !totals.Lines[1].ListValue.Equal(d("105000")) {
		t.Fatalf("setup list value = %s, want 105000", totals.Lines[1].ListValue)
	}

	got := risk.Score([]risk.LineInput{
		{ProductName: laptop.Name, CategoryID: laptop.CategoryID, CategoryName: laptop.CategoryName,
			GivenPct: totals.Lines[0].EffectiveDiscountPct, ListValue: totals.Lines[0].ListValue},
		{ProductName: setup.Name, CategoryID: setup.CategoryID, CategoryName: setup.CategoryName,
			GivenPct: totals.Lines[1].EffectiveDiscountPct, ListValue: totals.Lines[1].ListValue},
	}, risk.TierGold, cfg)

	if !got.BlendedScore.Equal(d("5.6")) {
		t.Errorf("BlendedScore = %s, want 5.6", got.BlendedScore)
	}
	if !got.MaxLineOverage.Equal(d("8")) {
		t.Errorf("MaxLineOverage = %s, want 8", got.MaxLineOverage)
	}
	if got.RequiredLevel != risk.LevelManagerFinance {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE", got.RequiredLevel)
	}
}

// Changing a ceiling in the database must change the verdict with no code
// change and no restart. This is the "real application logic, not hardcoded"
// requirement, demonstrated against live configuration rows.
func TestGovernanceIsDataDrivenNotHardcoded(t *testing.T) {
	_, q := seeded(t)
	ctx := context.Background()

	setup := productBySKU(t, ctx, q, "SV-SETUP")
	lines := []risk.LineInput{
		{ProductName: setup.Name, CategoryID: setup.CategoryID,
			GivenPct: d("18"), ListValue: d("105000")},
	}

	// Seeded: Gold tier 15%, Services 10%. The stricter of the two binds, so
	// 18% given is 8 points over.
	before := risk.Score(lines, risk.TierGold, loadRiskConfig(t, ctx, q))
	if !before.MaxLineOverage.Equal(d("8")) {
		t.Fatalf("MaxLineOverage = %s, want 8 under seeded config", before.MaxLineOverage)
	}
	if before.RequiredLevel != risk.LevelManagerFinance {
		t.Fatalf("RequiredLevel = %s, want MANAGER_FINANCE", before.RequiredLevel)
	}

	// Raise only the category ceiling to 25%. The Gold tier ceiling of 15%
	// now binds instead, so the overage falls to 3 points but does not
	// disappear. min(tier, category) is doing the work.
	if _, err := q.UpsertCategoryCeiling(ctx, sqlcgen.UpsertCategoryCeilingParams{
		CategoryID: setup.CategoryID, MaxDiscountPct: d("25"),
	}); err != nil {
		t.Fatalf("UpsertCategoryCeiling: %v", err)
	}

	mid := risk.Score(lines, risk.TierGold, loadRiskConfig(t, ctx, q))
	if !mid.MaxLineOverage.Equal(d("3")) {
		t.Errorf("MaxLineOverage = %s, want 3 once the tier ceiling binds", mid.MaxLineOverage)
	}
	if mid.RequiredLevel != risk.LevelManager {
		t.Errorf("RequiredLevel = %s, want MANAGER (de-escalated from finance)", mid.RequiredLevel)
	}

	// Raise the tier ceiling too, and the line becomes compliant.
	if _, err := q.UpsertDiscountTier(ctx, sqlcgen.UpsertDiscountTierParams{
		Tier: string(risk.TierGold), MaxDiscountPct: d("20"),
	}); err != nil {
		t.Fatalf("UpsertDiscountTier: %v", err)
	}

	after := risk.Score(lines, risk.TierGold, loadRiskConfig(t, ctx, q))
	if !after.MaxLineOverage.IsZero() {
		t.Errorf("MaxLineOverage = %s, want 0", after.MaxLineOverage)
	}
	if after.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s, want NONE once both ceilings allow 18%%", after.RequiredLevel)
	}
}

// Seeded stock is arranged so the demo split lands on two shipments and
// exactly one backordered laptop.
func TestSeededStockProducesTheDemoSplit(t *testing.T) {
	_, q := seeded(t)
	ctx := context.Background()

	laptop := productBySKU(t, ctx, q, "HW-LAPTOP")
	docking := productBySKU(t, ctx, q, "HW-DOCK")

	stockRows, err := q.GetStockForProducts(ctx, []int64{laptop.ID, docking.ID})
	if err != nil {
		t.Fatalf("GetStockForProducts: %v", err)
	}

	whs := map[int64]fulfillment.Warehouse{}
	stock := make([]fulfillment.Stock, 0, len(stockRows))
	for _, r := range stockRows {
		stock = append(stock, fulfillment.Stock{
			WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
		})
		whs[r.WarehouseID] = fulfillment.Warehouse{
			ID: r.WarehouseID, Name: r.WarehouseName, ShippingCostWeight: r.ShippingCostWeight,
		}
	}

	warehouses := make([]fulfillment.Warehouse, 0, len(whs))
	for _, w := range whs {
		warehouses = append(warehouses, w)
	}

	plan := fulfillment.Split([]fulfillment.Demand{
		{ProductID: laptop.ID, ProductName: laptop.Name, Qty: 7, UnitValue: laptop.UnitPrice},
		{ProductID: docking.ID, ProductName: docking.Name, Qty: 1, UnitValue: docking.UnitPrice},
	}, stock, warehouses)

	if plan.ShipmentCount != 2 {
		t.Errorf("ShipmentCount = %d, want 2", plan.ShipmentCount)
	}
	if len(plan.Backorders) != 1 || plan.Backorders[0].Qty != 1 {
		t.Errorf("Backorders = %+v, want exactly one laptop", plan.Backorders)
	}
	if plan.Strategy != fulfillment.StrategyGreedySplit {
		t.Errorf("Strategy = %s, want GREEDY_SPLIT", plan.Strategy)
	}
}

// The dashboard must show real findings, not placeholder rows.
func TestSeededDealHealthHasTruePositives(t *testing.T) {
	_, q := seeded(t)
	ctx := context.Background()

	stalled, err := q.FindStalledQuotations(ctx, sqlcgen.FindStalledQuotationsParams{
		StallDays: 7, PageSize: 20,
	})
	if err != nil {
		t.Fatalf("FindStalledQuotations: %v", err)
	}
	if len(stalled) == 0 {
		t.Error("no stalled quotations; the dashboard would be empty on stage")
	}
	for _, s := range stalled {
		if s.DaysInactive < 7 {
			t.Errorf("%s reported as stalled after %d days, below the 7-day window",
				s.Reference, s.DaysInactive)
		}
	}

	anomalies, err := q.FindDiscountAnomalies(ctx, sqlcgen.FindDiscountAnomaliesParams{
		MinSample: 3, Multiplier: d("1.5"), PageSize: 20,
	})
	if err != nil {
		t.Fatalf("FindDiscountAnomalies: %v", err)
	}
	if len(anomalies) == 0 {
		t.Fatal("no discount anomalies; the seeded outlier was not detected")
	}
	for _, a := range anomalies {
		if !a.DiscountPct.GreaterThan(a.BaselinePct) {
			t.Errorf("%s flagged at %s%% against a %s%% baseline, which is not an anomaly",
				a.Reference, a.DiscountPct, a.BaselinePct)
		}
	}
}

func TestSeedIsRepeatable(t *testing.T) {
	pool, q := seeded(t)
	ctx := context.Background()

	first, err := q.ListProducts(ctx, sqlcgen.ListProductsParams{PageSize: 100})
	if err != nil {
		t.Fatalf("ListProducts: %v", err)
	}

	// Re-running must not accumulate duplicates or violate a unique index.
	if err := seed.Run(ctx, pool); err != nil {
		t.Fatalf("second seed.Run: %v", err)
	}

	second, err := q.ListProducts(ctx, sqlcgen.ListProductsParams{PageSize: 100})
	if err != nil {
		t.Fatalf("ListProducts: %v", err)
	}
	if len(first) != len(second) {
		t.Errorf("product count changed from %d to %d across reseeds", len(first), len(second))
	}
}

// fixtureSeed keeps password hashing cheap; these tests are about the data,
// not about key stretching.
var fixtureSeed = seed.Options{BcryptCost: bcrypt.MinCost}
