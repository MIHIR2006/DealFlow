package cache_test

import (
	"testing"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/cache"
)

// A nil snapshot is what callers see before the first load. Accessors must
// answer rather than panic, so a request arriving during startup fails
// closed instead of crashing the process.
func TestNilSnapshotIsSafeToRead(t *testing.T) {
	var snap *cache.Snapshot

	if got := snap.CategoryName(1); got != "" {
		t.Errorf("CategoryName on nil = %q, want empty", got)
	}
	if _, ok := snap.TierCeiling(risk.TierGold); ok {
		t.Error("TierCeiling on nil reported a value")
	}
}

func TestSnapshotAccessors(t *testing.T) {
	snap := &cache.Snapshot{
		Risk: risk.Config{
			TierCeilingPct: map[risk.Tier]decimal.Decimal{
				risk.TierGold: decimal.NewFromInt(15),
			},
		},
		Categories: map[int64]string{7: "Hardware"},
	}

	if got := snap.CategoryName(7); got != "Hardware" {
		t.Errorf("CategoryName(7) = %q, want Hardware", got)
	}
	if got := snap.CategoryName(99); got != "" {
		t.Errorf("CategoryName(99) = %q, want empty for an unknown id", got)
	}

	v, ok := snap.TierCeiling(risk.TierGold)
	if !ok || !v.Equal(decimal.NewFromInt(15)) {
		t.Errorf("TierCeiling(GOLD) = %s, %v; want 15, true", v, ok)
	}
	if _, ok := snap.TierCeiling(risk.TierBronze); ok {
		t.Error("TierCeiling(BRONZE) reported a value that was never loaded")
	}
}
