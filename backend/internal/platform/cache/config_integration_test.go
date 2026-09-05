//go:build integration

package cache_test

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/cache"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/seed"
)

func loaded(t *testing.T) (*cache.Config, *sqlcgen.Queries) {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	pool, err := db.Open(context.Background(), config.Config{
		DatabaseURL: url, DBMaxConns: 8, DBMinConns: 1,
		DBMaxConnLife: time.Hour, DBMaxConnIdle: 30 * time.Minute,
	})
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := seed.Run(context.Background(), pool); err != nil {
		t.Fatalf("seed.Run: %v", err)
	}

	q := sqlcgen.New(pool)
	c := cache.New(q)
	if err := c.Reload(context.Background()); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	return c, q
}

func TestReloadPopulatesGovernanceFromTheDatabase(t *testing.T) {
	c, _ := loaded(t)

	snap := c.Get()
	if snap == nil {
		t.Fatal("snapshot is nil after Reload")
	}
	if len(snap.Risk.TierCeilingPct) != 3 {
		t.Errorf("loaded %d tiers, want 3", len(snap.Risk.TierCeilingPct))
	}
	if len(snap.Risk.CategoryCeilingPct) == 0 {
		t.Error("no category ceilings loaded")
	}
	if len(snap.Risk.Policies) == 0 {
		t.Error("no approval policies loaded")
	}
	if len(snap.Categories) == 0 {
		t.Error("no category names loaded; the flagged table would have blank labels")
	}

	gold, ok := snap.TierCeiling(risk.TierGold)
	if !ok || !gold.Equal(decimal.NewFromInt(15)) {
		t.Errorf("GOLD ceiling = %s, %v; want 15, true", gold, ok)
	}
}

func TestVersionIncrementsAndSnapshotIsReplaced(t *testing.T) {
	c, q := loaded(t)
	ctx := context.Background()

	before := c.Get()
	v0 := c.Version()

	if _, err := q.UpsertDiscountTier(ctx, sqlcgen.UpsertDiscountTierParams{
		Tier: "GOLD", MaxDiscountPct: decimal.NewFromInt(22),
	}); err != nil {
		t.Fatalf("UpsertDiscountTier: %v", err)
	}
	if err := c.Reload(ctx); err != nil {
		t.Fatalf("Reload: %v", err)
	}

	after := c.Get()
	if c.Version() != v0+1 {
		t.Errorf("version = %d, want %d", c.Version(), v0+1)
	}
	if after == before {
		t.Fatal("Reload mutated the published snapshot instead of replacing it")
	}

	// A reader holding the old pointer must still see consistent, unchanged
	// configuration rather than a half-updated map.
	if old, _ := before.TierCeiling(risk.TierGold); !old.Equal(decimal.NewFromInt(15)) {
		t.Errorf("the previous snapshot changed under its reader: GOLD = %s, want 15", old)
	}
	if got, _ := after.TierCeiling(risk.TierGold); !got.Equal(decimal.NewFromInt(22)) {
		t.Errorf("new snapshot GOLD = %s, want 22", got)
	}
}

// Reload must not tear the snapshot while requests are scoring against it.
func TestConcurrentReadsDuringReload(t *testing.T) {
	c, _ := loaded(t)
	ctx := context.Background()

	stop := make(chan struct{})
	var wg sync.WaitGroup

	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				snap := c.Get()
				if snap == nil {
					continue
				}
				// Score against whatever snapshot is current; a torn map
				// would trip the race detector here.
				risk.Score([]risk.LineInput{
					{CategoryID: 1, GivenPct: decimal.NewFromInt(18), ListValue: decimal.NewFromInt(1000)},
				}, risk.TierGold, snap.Risk)
			}
		}()
	}

	for i := 0; i < 30; i++ {
		if err := c.Reload(ctx); err != nil {
			t.Errorf("Reload: %v", err)
			break
		}
	}
	close(stop)
	wg.Wait()
}

// A failed reload must keep the previous configuration. Serving with no
// ceilings would score every quotation as compliant.
func TestFailedReloadKeepsThePreviousSnapshot(t *testing.T) {
	c, _ := loaded(t)

	before := c.Get()
	versionBefore := c.Version()

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	if err := c.Reload(cancelled); err == nil {
		t.Fatal("Reload with a cancelled context succeeded, want an error")
	}

	if c.Get() != before {
		t.Error("a failed reload replaced the snapshot")
	}
	if c.Version() != versionBefore {
		t.Errorf("version moved to %d on a failed reload, want %d", c.Version(), versionBefore)
	}
}
