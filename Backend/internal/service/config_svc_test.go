//go:build integration

package service_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/cache"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/seed"
	"dealflow360/backend/internal/service"
)

type configHarness struct {
	pool      *db.Pool
	queries   *sqlcgen.Queries
	configSvc *service.ConfigService
}

func newConfigHarness(t *testing.T) *configHarness {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	pool, err := db.Open(context.Background(), config.Config{
		DatabaseURL:   url,
		DBMaxConns:    2,
		DBMinConns:    1,
		DBMaxConnLife: time.Hour,
		DBMaxConnIdle: 30 * time.Minute,
	})
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := seed.Run(context.Background(), pool); err != nil {
		t.Fatalf("seed.Run: %v", err)
	}

	queries := sqlcgen.New(pool)
	cfgCache := cache.New(queries)
	if err := cfgCache.Reload(context.Background()); err != nil {
		t.Fatalf("cache.Reload: %v", err)
	}

	return &configHarness{
		pool:      pool,
		queries:   queries,
		configSvc: service.NewConfigService(queries, cfgCache),
	}
}

func TestConfigService_CategoriesAndProducts(t *testing.T) {
	h := newConfigHarness(t)
	ctx := context.Background()

	// 1. Create Category
	cat, err := h.configSvc.CreateCategory(ctx, "Integration Test Category")
	if err != nil {
		t.Fatalf("CreateCategory failed: %v", err)
	}
	if cat.ID == 0 {
		t.Error("expected valid ID")
	}

	// 2. Create Product
	in := service.ProductInput{
		CategoryID: cat.ID,
		SKU:        "ITEST-123",
		Name:       "Integration Test Product",
		Unit:       "unit",
		UnitPrice:  decimal.NewFromFloat(100.0),
		UnitCost:   decimal.NewFromFloat(80.0),
		IsActive:   true,
	}
	prod, err := h.configSvc.CreateProduct(ctx, in)
	if err != nil {
		t.Fatalf("CreateProduct failed: %v", err)
	}
	if prod.ID == 0 {
		t.Error("expected valid product ID")
	}

	// 3. Update Product
	in.Name = "Integration Test Product Updated"
	updated, err := h.configSvc.UpdateProduct(ctx, prod.ID, in)
	if err != nil {
		t.Fatalf("UpdateProduct failed: %v", err)
	}
	if updated.Name != "Integration Test Product Updated" {
		t.Errorf("expected updated name, got %q", updated.Name)
	}
}

func TestConfigService_SetDiscountTier(t *testing.T) {
	h := newConfigHarness(t)
	ctx := context.Background()

	// Set tier
	tier, err := h.configSvc.SetDiscountTier(ctx, risk.TierGold, decimal.NewFromFloat(35.5))
	if err != nil {
		t.Fatalf("SetDiscountTier failed: %v", err)
	}
	if tier.Tier != string(risk.TierGold) {
		t.Errorf("got tier %q, want %q", tier.Tier, risk.TierGold)
	}

	// Verify the cache refreshed
	snapshot := h.configSvc.Snapshot()
	val, ok := snapshot.TierCeiling(risk.TierGold)
	if !ok || !val.Equal(decimal.NewFromFloat(35.5)) {
		t.Errorf("cache was not refreshed correctly, got %v", val)
	}
}
