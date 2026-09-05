//go:build integration

package http_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"dealflow360/backend/internal/seed"
)

// bulkQuotations is enough rows that Postgres stops preferring a sequential
// scan out of sheer smallness, so a plan measured here means something.
const bulkQuotations = 2000

// atScale seeds the demo dataset plus filler, so budgets are measured against
// a table the planner takes seriously rather than a dozen rows.
func atScale(t *testing.T) *harness {
	t.Helper()

	h := newHarness(t)
	if err := seed.Bulk(context.Background(), h.pool, bulkQuotations, 5); err != nil {
		t.Fatalf("seed.Bulk: %v", err)
	}
	return h
}

// measure runs a request and reports what it cost the database.
func measure(t *testing.T, h *harness, method, path, token string, body any) (queries int, ms float64, code int) {
	t.Helper()

	w := h.do(method, path, token, body)
	code = w.Code

	raw := w.Header().Get("X-DB-Queries")
	n, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("%s %s: X-DB-Queries = %q", method, path, raw)
	}
	took, err := strconv.ParseFloat(w.Header().Get("X-DB-Time-Ms"), 64)
	if err != nil {
		took = 0
	}
	return n, took, code
}

// Every budgeted endpoint, measured against a populated database.
//
// The budgets are the ones recorded in the performance document. They exist
// so a regression is caught by a failing test rather than by a demo that has
// quietly become sluggish.
func TestQueryBudgetsHoldAtScale(t *testing.T) {
	h := atScale(t)

	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	// A quotation with several lines, so the detail view is doing real work.
	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	monitor := productBySKUOverHTTP(t, h, "HW-MON27")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	for _, p := range []int64{laptop.ID, docking.ID, monitor.ID, setup.ID} {
		addLine(t, h, rep, q.ID, p, "2", "5")
	}

	cases := []struct {
		name, method, path, token string
		body                      any
		budget                    int
	}{
		{"quotation list", http.MethodGet, "/api/v1/quotations?limit=25", rep, nil, 3},
		{"quotation detail", http.MethodGet, "/api/v1/quotations/" + itoa(q.ID), rep, nil, 5},
		{"upsell panel", http.MethodGet, "/api/v1/quotations/" + itoa(q.ID) + "/upsell", rep, nil, 4},
		{"approvals inbox", http.MethodGet, "/api/v1/approvals?limit=25", manager, nil, 2},
		{"deal health", http.MethodGet, "/api/v1/dashboard/deal-health", manager, nil, 6},
		{"invoice list", http.MethodGet, "/api/v1/invoices?limit=25", rep, nil, 2},
		{"product catalogue", http.MethodGet, "/api/v1/products?limit=25", rep, nil, 2},
		{
			"line recalculation", http.MethodPost,
			"/api/v1/quotations/" + itoa(q.ID) + "/lines", rep,
			map[string]any{"product_id": laptop.ID, "qty": "1", "discount_pct": "5"}, 9,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			queries, ms, code := measure(t, h, tc.method, tc.path, tc.token, tc.body)
			if code != http.StatusOK {
				t.Fatalf("status = %d", code)
			}
			t.Logf("%-20s %d queries  %.2f ms", tc.name, queries, ms)
			if queries > tc.budget {
				t.Errorf("%s took %d queries against a budget of %d", tc.name, queries, tc.budget)
			}
		})
	}
}

// A page of results must cost the same whether the table holds five rows or
// five thousand. If it does not, the listing is scanning rather than seeking.
func TestListingCostIsIndependentOfTableSize(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	small, _, code := measure(t, h, http.MethodGet, "/api/v1/quotations?limit=25", rep, nil)
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	if err := seed.Bulk(context.Background(), h.pool, bulkQuotations, 5); err != nil {
		t.Fatalf("seed.Bulk: %v", err)
	}

	large, ms, code := measure(t, h, http.MethodGet, "/api/v1/quotations?limit=25", rep, nil)
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}

	t.Logf("quotation list: %d queries at a handful of rows, %d at %d (%.2f ms)",
		small, large, bulkQuotations, ms)
	if large != small {
		t.Errorf("cost moved from %d to %d queries as the table grew", small, large)
	}
}

// Keyset pagination must walk the whole table at a constant cost per page.
// An offset-based listing degrades as the cursor moves; this one must not.
func TestPaginationCostIsFlatAcrossPages(t *testing.T) {
	h := atScale(t)
	rep := h.login(t, "rep@dealflow360.test")

	var cursor string
	var first, last int

	for page := 0; page < 12; page++ {
		path := "/api/v1/quotations?limit=25"
		if cursor != "" {
			path += "&cursor=" + cursor
		}

		w := h.do(http.MethodGet, path, rep, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("page %d = %d: %s", page, w.Code, w.Body)
		}

		n, err := strconv.Atoi(w.Header().Get("X-DB-Queries"))
		if err != nil {
			t.Fatalf("X-DB-Queries: %v", err)
		}
		if page == 0 {
			first = n
		}
		last = n

		var body struct {
			Data       []struct{ ID int64 } `json:"data"`
			NextCursor string               `json:"next_cursor"`
		}
		decodeJSON(t, w, &body)
		if body.NextCursor == "" {
			break
		}
		cursor = body.NextCursor
	}

	if last != first {
		t.Errorf("page cost drifted from %d to %d queries; pagination is not keyset", first, last)
	}
}

// The detail view must not cost more because a quotation has more lines.
func TestDetailCostIsIndependentOfLineCount(t *testing.T) {
	h := atScale(t)
	rep := h.login(t, "rep@dealflow360.test")

	products := []int64{
		productBySKUOverHTTP(t, h, "HW-LAPTOP").ID,
		productBySKUOverHTTP(t, h, "HW-DOCK").ID,
		productBySKUOverHTTP(t, h, "HW-MON27").ID,
		productBySKUOverHTTP(t, h, "SV-SETUP").ID,
		productBySKUOverHTTP(t, h, "SV-TRAIN").ID,
	}

	small := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, small.ID, products[0], "1", "0")

	large := newQuote(t, h, rep, "Acme Corporation")
	for _, p := range products {
		addLine(t, h, rep, large.ID, p, "1", "0")
	}

	one, _, _ := measure(t, h, http.MethodGet, "/api/v1/quotations/"+itoa(small.ID), rep, nil)
	five, ms, _ := measure(t, h, http.MethodGet, "/api/v1/quotations/"+itoa(large.ID), rep, nil)

	t.Logf("detail: %d queries for 1 line, %d for 5 (%.2f ms)", one, five, ms)
	if five != one {
		t.Errorf("cost moved from %d to %d queries as lines grew; something reads per line", one, five)
	}
}

// A response should still arrive promptly with the table populated. The
// threshold is generous on purpose: this catches an accidental table scan,
// not a slow machine.
func TestBudgetedEndpointsStayResponsiveAtScale(t *testing.T) {
	h := atScale(t)
	manager := h.login(t, "manager@dealflow360.test")

	for _, path := range []string{
		"/api/v1/quotations?limit=25",
		"/api/v1/dashboard/deal-health",
		"/api/v1/approvals?limit=25",
		"/api/v1/reports",
	} {
		t.Run(path, func(t *testing.T) {
			start := time.Now()
			_, ms, code := measure(t, h, http.MethodGet, path, manager, nil)
			wall := time.Since(start)

			if code != http.StatusOK {
				t.Fatalf("status = %d", code)
			}
			t.Logf("%-38s %.2f ms in the database, %v wall", path, ms, wall.Round(time.Millisecond))
			if ms > 250 {
				t.Errorf("%s spent %.2f ms in the database; a scan has crept in", path, ms)
			}
		})
	}
}
