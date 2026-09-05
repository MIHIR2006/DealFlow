//go:build integration

package http_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/risk"
)

// The problem statement requires the governance rules to be real application
// logic rather than values compiled in. This is that claim, demonstrated over
// HTTP against a live process:
//
//	score a quotation -> change a ceiling through the API -> score again ->
//	the verdict changes, with no restart and no deployment.
func TestChangingACeilingChangesTheNextVerdict(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// The Setup Service line from the worked example: 18% given against a
	// Services ceiling of 10%, so 8 points over and bound for finance.
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")
	lines := []risk.LineInput{{
		ProductName: setup.Name,
		CategoryID:  setup.CategoryID,
		GivenPct:    decimal.NewFromInt(18),
		ListValue:   decimal.NewFromInt(105000),
	}}

	before := risk.Score(lines, risk.TierGold, h.cache.Get().Risk)
	if before.RequiredLevel != risk.LevelManagerFinance {
		t.Fatalf("RequiredLevel = %s under seeded config, want MANAGER_FINANCE", before.RequiredLevel)
	}
	versionBefore := h.cache.Version()

	// Relax both the category and the tier through the API, as an admin would.
	adminToken := h.login(t, "admin@dealflow360.test")

	w := h.do(http.MethodPut,
		"/api/v1/governance/categories/"+itoa(setup.CategoryID)+"/ceiling",
		adminToken, map[string]string{"max_discount_pct": "25"})
	if w.Code != http.StatusOK {
		t.Fatalf("set category ceiling = %d: %s", w.Code, w.Body)
	}

	w = h.do(http.MethodPut, "/api/v1/governance/tiers/GOLD",
		adminToken, map[string]string{"max_discount_pct": "20"})
	if w.Code != http.StatusOK {
		t.Fatalf("set tier ceiling = %d: %s", w.Code, w.Body)
	}

	// The cache reloaded on each write, without a restart.
	if h.cache.Version() <= versionBefore {
		t.Errorf("cache version = %d, want it past %d after two writes",
			h.cache.Version(), versionBefore)
	}

	after := risk.Score(lines, risk.TierGold, h.cache.Get().Risk)
	if after.RequiredLevel != risk.LevelNone {
		t.Errorf("RequiredLevel = %s after raising both ceilings, want NONE", after.RequiredLevel)
	}
	if !after.MaxLineOverage.IsZero() {
		t.Errorf("MaxLineOverage = %s, want 0", after.MaxLineOverage)
	}

	// Restore, so the ordering of tests cannot leave the fixture altered.
	if _, err := h.q.UpsertDiscountTier(ctx, sqlcgen.UpsertDiscountTierParams{
		Tier: "GOLD", MaxDiscountPct: decimal.NewFromInt(15),
	}); err != nil {
		t.Fatalf("restore tier: %v", err)
	}
}

// GET /governance reports which configuration version is in force, so an
// approval can be explained after the fact.
func TestGovernanceEndpointReportsTheLiveConfiguration(t *testing.T) {
	h := newHarness(t)
	token := h.login(t, "manager@dealflow360.test")

	w := h.do(http.MethodGet, "/api/v1/governance", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	var got struct {
		Version  int64                                   `json:"version"`
		Tiers    []struct{ Tier, MaxDiscountPct string } `json:"tiers"`
		Ceilings []struct {
			CategoryID     int64  `json:"category_id"`
			CategoryName   string `json:"category_name"`
			MaxDiscountPct string `json:"max_discount_pct"`
		} `json:"category_ceilings"`
		Policies []struct {
			Name            string `json:"name"`
			RequiresFinance bool   `json:"requires_finance"`
		} `json:"policies"`
	}
	decodeJSON(t, w, &got)

	if got.Version == 0 {
		t.Error("version is 0; the response cannot say which rules produced a score")
	}
	if len(got.Tiers) != 3 {
		t.Errorf("tiers = %d, want 3", len(got.Tiers))
	}
	if len(got.Ceilings) == 0 {
		t.Error("no category ceilings returned")
	}
	if len(got.Policies) == 0 {
		t.Error("no approval policies returned")
	}
	for _, cc := range got.Ceilings {
		if cc.CategoryName == "" {
			t.Errorf("ceiling for category %d has no name", cc.CategoryID)
		}
	}
}

func TestConfigWritesAreRestrictedByRole(t *testing.T) {
	h := newHarness(t)

	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	admin := h.login(t, "admin@dealflow360.test")

	cases := []struct {
		name, method, path  string
		body                any
		rep, manager, admin int
	}{
		{
			name: "tier ceiling", method: http.MethodPut, path: "/api/v1/governance/tiers/SILVER",
			body: map[string]string{"max_discount_pct": "10"},
			// Setting discount ceilings is a manager's job.
			rep: http.StatusForbidden, manager: http.StatusOK, admin: http.StatusOK,
		},
		{
			name: "create product", method: http.MethodPost, path: "/api/v1/products",
			body: map[string]any{
				"category_id": 1, "sku": "ROLE-TEST", "name": "Role Test",
				"unit_price": "100", "unit_cost": "50",
			},
			// The catalogue is administrative.
			rep: http.StatusForbidden, manager: http.StatusForbidden, admin: http.StatusCreated,
		},
		{
			name: "create warehouse", method: http.MethodPost, path: "/api/v1/warehouses",
			body: map[string]string{"name": "Role Test Depot"},
			rep:  http.StatusForbidden, manager: http.StatusForbidden, admin: http.StatusCreated,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := h.do(tc.method, tc.path, rep, tc.body).Code; got != tc.rep {
				t.Errorf("as REP = %d, want %d", got, tc.rep)
			}
			if got := h.do(tc.method, tc.path, manager, tc.body).Code; got != tc.manager {
				t.Errorf("as MANAGER = %d, want %d", got, tc.manager)
			}
			if got := h.do(tc.method, tc.path, admin, tc.body).Code; got != tc.admin {
				t.Errorf("as ADMIN = %d, want %d", got, tc.admin)
			}
		})
	}
}

// A rep must be able to read the catalogue: the quotation builder needs it.
func TestAnyStaffCanReadConfiguration(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	for _, path := range []string{
		"/api/v1/categories", "/api/v1/products",
		"/api/v1/warehouses", "/api/v1/subscription-plans", "/api/v1/governance",
	} {
		if got := h.do(http.MethodGet, path, rep, nil).Code; got != http.StatusOK {
			t.Errorf("GET %s as REP = %d, want 200", path, got)
		}
	}
}

func TestProductListIsPaginatedAndBounded(t *testing.T) {
	h := newHarness(t)
	token := h.login(t, "rep@dealflow360.test")

	w := h.do(http.MethodGet, "/api/v1/products?limit=3", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	var page struct {
		Data       []map[string]any `json:"data"`
		NextCursor string           `json:"next_cursor"`
	}
	decodeJSON(t, w, &page)

	if len(page.Data) != 3 {
		t.Errorf("returned %d products, want the requested 3", len(page.Data))
	}
	if page.NextCursor == "" {
		t.Fatal("next_cursor is empty although more products exist")
	}

	// The cursor must actually advance rather than repeat the first page.
	next := h.do(http.MethodGet, "/api/v1/products?limit=3&cursor="+page.NextCursor, token, nil)
	var page2 struct {
		Data []map[string]any `json:"data"`
	}
	decodeJSON(t, next, &page2)

	if len(page2.Data) == 0 {
		t.Fatal("the second page is empty")
	}
	if page.Data[0]["id"] == page2.Data[0]["id"] {
		t.Error("the cursor returned the same page again")
	}

	// An oversized limit is capped, not honoured.
	big := h.do(http.MethodGet, "/api/v1/products?limit=100000", token, nil)
	var capped struct {
		Data []map[string]any `json:"data"`
	}
	decodeJSON(t, big, &capped)
	if len(capped.Data) > 100 {
		t.Errorf("limit=100000 returned %d rows; it must be capped", len(capped.Data))
	}
}

// A policy that requires nobody, or that matches everything, is a
// misconfiguration that would silently break routing.
func TestNonsensePoliciesAreRefused(t *testing.T) {
	h := newHarness(t)
	token := h.login(t, "manager@dealflow360.test")

	for name, body := range map[string]map[string]any{
		"no approver": {
			"name": "Requires nobody", "min_blended": "5",
			"requires_manager": false, "requires_finance": false,
		},
		"matches everything": {
			"name": "Zero thresholds", "min_blended": "0", "min_line_overage": "0",
			"requires_manager": true,
		},
	} {
		t.Run(name, func(t *testing.T) {
			w := h.do(http.MethodPost, "/api/v1/governance/policies", token, body)
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422: %s", w.Code, w.Body)
			}
		})
	}
}

func TestInvalidPercentagesAreRefused(t *testing.T) {
	h := newHarness(t)
	token := h.login(t, "manager@dealflow360.test")

	for name, pct := range map[string]string{
		"above one hundred": "150",
		"negative":          "-5",
		"not a number":      "lots",
	} {
		t.Run(name, func(t *testing.T) {
			w := h.do(http.MethodPut, "/api/v1/governance/tiers/BRONZE", token,
				map[string]string{"max_discount_pct": pct})
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422: %s", w.Code, w.Body)
			}
		})
	}
}

// Stock cannot be lowered below what orders have already committed, or the
// system would promise units it has given away.
func TestStockCannotDropBelowWhatIsReserved(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	token := h.login(t, "admin@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	var warehouseID int64
	if err := h.pool.QueryRow(ctx,
		`SELECT warehouse_id FROM stock_items WHERE product_id = $1 ORDER BY warehouse_id LIMIT 1`,
		laptop.ID).Scan(&warehouseID); err != nil {
		t.Fatalf("find stock row: %v", err)
	}
	if _, err := h.pool.Exec(ctx,
		`UPDATE stock_items SET reserved = 3 WHERE warehouse_id = $1 AND product_id = $2`,
		warehouseID, laptop.ID); err != nil {
		t.Fatalf("reserve stock: %v", err)
	}

	w := h.do(http.MethodPut, "/api/v1/warehouses/"+itoa(warehouseID)+"/stock", token,
		map[string]any{"product_id": laptop.ID, "on_hand": 1})
	if w.Code != http.StatusConflict {
		t.Errorf("lowering stock below reserved = %d, want 409: %s", w.Code, w.Body)
	}

	// Raising it is fine, and is what makes a backorder consolidatable.
	ok := h.do(http.MethodPost, "/api/v1/warehouses/"+itoa(warehouseID)+"/stock", token,
		map[string]any{"product_id": laptop.ID, "qty": 5})
	if ok.Code != http.StatusOK {
		t.Errorf("adding stock = %d, want 200: %s", ok.Code, ok.Body)
	}
}

func TestUnknownReferencesAreValidationErrorsNotCrashes(t *testing.T) {
	h := newHarness(t)
	token := h.login(t, "admin@dealflow360.test")

	w := h.do(http.MethodPost, "/api/v1/products", token, map[string]any{
		"category_id": 999999, "sku": "GHOST", "name": "Ghost",
		"unit_price": "100", "unit_cost": "50",
	})
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("unknown category = %d, want 422: %s", w.Code, w.Body)
	}

	dup := h.do(http.MethodPost, "/api/v1/categories", token, map[string]string{"name": "Hardware"})
	if dup.Code != http.StatusConflict {
		t.Errorf("duplicate category = %d, want 409: %s", dup.Code, dup.Body)
	}
}
