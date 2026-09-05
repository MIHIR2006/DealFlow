// Package cache holds the governance configuration in process.
//
// The risk engine reads tier ceilings, category ceilings, and approval
// policies on every keystroke in the quotation builder. Those rows change a
// handful of times a day and number in the dozens, so reading them from
// Postgres on each recalculation would be the single largest source of
// avoidable query volume in the system.
//
// The cache is loaded at boot and reloaded whenever an administrator writes
// configuration. Each replica keeps its own copy: a tier ceiling that is a
// few milliseconds stale on one replica is harmless, and the alternative
// (Redis and an invalidation channel) buys nothing at this scale.
package cache

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/risk"
)

// Snapshot is an immutable view of the governance configuration.
//
// Readers receive a pointer and must never mutate it. Reloading builds a new
// Snapshot and swaps the pointer, so a request that started before a reload
// finishes against consistent configuration rather than seeing a half-updated
// map.
type Snapshot struct {
	// Version increments on every successful reload. It exists so a response
	// can say which configuration produced a score, which matters when an
	// approval is questioned later.
	Version int64

	Risk       risk.Config
	Categories map[int64]string

	LoadedAt time.Time
}

// CategoryName returns a category's display name, or "" when unknown.
func (s *Snapshot) CategoryName(id int64) string {
	if s == nil {
		return ""
	}
	return s.Categories[id]
}

// TierCeiling returns the base ceiling for a tier and whether it is defined.
func (s *Snapshot) TierCeiling(tier risk.Tier) (decimal.Decimal, bool) {
	if s == nil {
		return decimal.Zero, false
	}
	v, ok := s.Risk.TierCeilingPct[tier]
	return v, ok
}

// Config loads and serves the governance snapshot.
type Config struct {
	q *sqlcgen.Queries

	mu   sync.RWMutex
	snap *Snapshot

	version atomic.Int64
}

// New builds an unloaded cache. Call Reload before serving traffic.
func New(q *sqlcgen.Queries) *Config {
	return &Config{q: q}
}

// Reload rebuilds the snapshot from the database and publishes it.
//
// On failure the previous snapshot is kept. A transient database error must
// not leave the risk engine with no ceilings, which would score every
// quotation as compliant.
func (c *Config) Reload(ctx context.Context) error {
	snap, err := c.build(ctx)
	if err != nil {
		return err
	}

	snap.Version = c.version.Add(1)
	snap.LoadedAt = time.Now()

	c.mu.Lock()
	c.snap = snap
	c.mu.Unlock()

	return nil
}

// Get returns the current snapshot. It is nil only before the first Reload.
func (c *Config) Get() *Snapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.snap
}

// Version reports the current snapshot's version.
func (c *Config) Version() int64 { return c.version.Load() }

func (c *Config) build(ctx context.Context) (*Snapshot, error) {
	snap := &Snapshot{
		Risk: risk.Config{
			TierCeilingPct:     make(map[risk.Tier]decimal.Decimal),
			CategoryCeilingPct: make(map[int64]decimal.Decimal),
		},
		Categories: make(map[int64]string),
	}

	tiers, err := c.q.ListDiscountTiers(ctx)
	if err != nil {
		return nil, fmt.Errorf("load discount tiers: %w", err)
	}
	for _, t := range tiers {
		snap.Risk.TierCeilingPct[risk.Tier(t.Tier)] = t.MaxDiscountPct
	}

	ceilings, err := c.q.ListCategoryCeilings(ctx)
	if err != nil {
		return nil, fmt.Errorf("load category ceilings: %w", err)
	}
	for _, cc := range ceilings {
		snap.Risk.CategoryCeilingPct[cc.CategoryID] = cc.MaxDiscountPct
	}

	policies, err := c.q.ListApprovalPolicies(ctx)
	if err != nil {
		return nil, fmt.Errorf("load approval policies: %w", err)
	}
	snap.Risk.Policies = make([]risk.Policy, 0, len(policies))
	for _, p := range policies {
		snap.Risk.Policies = append(snap.Risk.Policies, risk.Policy{
			ID:              p.ID,
			Name:            p.Name,
			MinBlended:      p.MinBlended,
			MinLineOverage:  p.MinLineOverage,
			RequiresManager: p.RequiresManager,
			RequiresFinance: p.RequiresFinance,
		})
	}

	categories, err := c.q.ListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("load categories: %w", err)
	}
	for _, cat := range categories {
		snap.Categories[cat.ID] = cat.Name
	}

	return snap, nil
}
