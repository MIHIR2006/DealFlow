//go:build integration

package http_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"dealflow360/backend/internal/platform/config"
)

// upsellBody mirrors the ranked panel the quotation builder renders.
type upsellBody struct {
	Data []struct {
		ProductID      int64  `json:"product_id"`
		Name           string `json:"name"`
		SKU            string `json:"sku"`
		UnitPrice      string `json:"unit_price"`
		IsPromoted     bool   `json:"is_promoted"`
		Score          string `json:"score"`
		MarginDelta    string `json:"margin_delta"`
		MarginPctDelta string `json:"margin_pct_delta"`
	} `json:"data"`
}

func getUpsells(t *testing.T, h *harness, token string, quoteID int64) upsellBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(quoteID)+"/upsell", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("upsell = %d: %s", w.Code, w.Body)
	}

	var out upsellBody
	decodeJSON(t, w, &out)
	return out
}

// stubEngine stands in for the Python recommendation service. It records what
// the backend asked for and answers with whatever reply is currently set, so a
// test can wire the harness first and decide the ranking once it knows the
// seeded product ids.
type stubEngine struct {
	server *httptest.Server
	calls  int
	gotIDs []int64
	gotTop int
	reply  string
}

func newStubEngine(t *testing.T) *stubEngine {
	t.Helper()

	s := &stubEngine{reply: `{"suggestions":[]}`}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			QuotationID *int64  `json:"quotation_id"`
			ProductIDs  []int64 `json:"product_ids"`
			TopN        int     `json:"top_n"`
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &req); err != nil {
			t.Errorf("engine got a body it could not parse: %s", body)
		}
		if req.QuotationID == nil || *req.QuotationID == 0 {
			t.Error("engine was called without a quotation id to score against")
		}

		s.calls++
		s.gotIDs = req.ProductIDs
		s.gotTop = req.TopN
		_, _ = io.WriteString(w, s.reply)
	}))
	t.Cleanup(s.server.Close)
	return s
}

func withEngine(url string) func(*config.Config) {
	return func(c *config.Config) { c.RecommendationURL = url }
}

// The engine ranks; the backend prices. A suggestion the engine returns must
// come back in the engine's order, with money computed here from the current
// catalogue rather than taken from the engine's own response.
func TestUpsellPanelServesTheRecommendationEngineRanking(t *testing.T) {
	engine := newStubEngine(t)

	h := newHarness(t, withEngine(engine.server.URL))
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	monitor := productBySKUOverHTTP(t, h, "HW-MON27")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")

	// Deliberately the reverse of what upsell_rules ranks first for a laptop
	// (the docking station, score 0.85), so the order proves the source. The
	// prices here are nonsense on purpose: none of them may reach the panel.
	engine.reply = fmt.Sprintf(`{"suggestions":[
		{"product_id":%d,"name":"ignored","is_promoted":false,"margin_pct":99,"margin_delta":99,"confidence":0.71,"co_purchase_count":11},
		{"product_id":%d,"name":"ignored","is_promoted":false,"margin_pct":99,"margin_delta":99,"confidence":0.44,"co_purchase_count":6}
	]}`, monitor.ID, docking.ID)

	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

	out := getUpsells(t, h, rep, q.ID)

	if engine.calls == 0 {
		t.Fatal("the engine was never called")
	}
	if len(engine.gotIDs) != 1 || engine.gotIDs[0] != laptop.ID {
		t.Errorf("engine got product_ids %v, want the cart's [%d]", engine.gotIDs, laptop.ID)
	}

	if len(out.Data) != 2 {
		t.Fatalf("suggestions = %d, want 2: %+v", len(out.Data), out.Data)
	}
	if out.Data[0].ProductID != monitor.ID || out.Data[1].ProductID != docking.ID {
		t.Fatalf("the engine's ranking was not preserved: %+v", out.Data)
	}

	if out.Data[0].UnitPrice != monitor.UnitPrice {
		t.Errorf("unit_price = %s, want the catalogue's %s", out.Data[0].UnitPrice, monitor.UnitPrice)
	}
	if out.Data[0].SKU != "HW-MON27" {
		t.Errorf("sku = %s, want HW-MON27", out.Data[0].SKU)
	}
	// 18,000 - 13,500 on the monitor, priced by the backend, not the engine.
	if out.Data[0].MarginDelta != "4500" {
		t.Errorf("margin_delta = %s, want 4500", out.Data[0].MarginDelta)
	}
	// Confidence from the co-purchase matrix is what "score" means here.
	if out.Data[0].Score != "0.71" {
		t.Errorf("score = %s, want the engine's confidence 0.71", out.Data[0].Score)
	}
}

// A product already in the cart must never be suggested back, even if the
// engine's matrix is stale enough to return it.
func TestUpsellPanelDropsEngineSuggestionsAlreadyInTheCart(t *testing.T) {
	engine := newStubEngine(t)

	h := newHarness(t, withEngine(engine.server.URL))
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")

	engine.reply = fmt.Sprintf(`{"suggestions":[
		{"product_id":%d,"is_promoted":false,"confidence":0.9,"co_purchase_count":20},
		{"product_id":%d,"is_promoted":false,"confidence":0.5,"co_purchase_count":8}
	]}`, laptop.ID, docking.ID)

	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

	out := getUpsells(t, h, rep, q.ID)

	for _, s := range out.Data {
		if s.ProductID == laptop.ID {
			t.Fatalf("the cart's own product was suggested back: %+v", out.Data)
		}
	}
	if len(out.Data) != 1 || out.Data[0].ProductID != docking.ID {
		t.Fatalf("suggestions = %+v, want only the docking station", out.Data)
	}
}

// The engine is an enrichment, not a dependency. Every way it can fail must
// leave the rep with the upsell_rules ranking rather than an error.
func TestUpsellPanelFallsBackWhenTheEngineFails(t *testing.T) {
	cases := map[string]http.HandlerFunc{
		"error status": func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "boom", http.StatusInternalServerError)
		},
		"no suggestions": func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.WriteString(w, `{"suggestions":[]}`)
		},
		"malformed body": func(w http.ResponseWriter, r *http.Request) {
			_, _ = io.WriteString(w, `<html>not json</html>`)
		},
	}

	for name, handler := range cases {
		t.Run(name, func(t *testing.T) {
			engine := httptest.NewServer(handler)
			defer engine.Close()

			h := newHarness(t, withEngine(engine.URL))
			rep := h.login(t, "rep@dealflow360.test")

			laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
			q := newQuote(t, h, rep, "Acme Corporation")
			q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

			out := getUpsells(t, h, rep, q.ID)
			if len(out.Data) == 0 {
				t.Fatal("no suggestions: the rules-based fallback did not run")
			}

			// The seeded rules pair a laptop with the promoted docking station.
			if out.Data[0].SKU != "HW-DOCK" || !out.Data[0].IsPromoted {
				t.Errorf("top suggestion = %+v, want the promoted HW-DOCK from upsell_rules", out.Data[0])
			}
		})
	}
}

// An engine that never answers must not hold a rep's request open.
func TestUpsellPanelDoesNotWaitOnAStalledEngine(t *testing.T) {
	block := make(chan struct{})
	engine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
	}))
	defer func() { close(block); engine.Close() }()

	h := newHarness(t, func(c *config.Config) {
		c.RecommendationURL = engine.URL
		c.RecommendationTimeout = 50 * time.Millisecond
	})
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

	out := getUpsells(t, h, rep, q.ID)
	if len(out.Data) == 0 {
		t.Fatal("a stalled engine cost the rep the panel entirely")
	}
}

// With no engine configured at all -- the default deployment -- the endpoint
// behaves exactly as it did before the engine existed.
func TestUpsellPanelWorksWithNoEngineConfigured(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

	out := getUpsells(t, h, rep, q.ID)
	if len(out.Data) == 0 {
		t.Fatal("no suggestions from the rules-based ranking")
	}
	if out.Data[0].SKU != "HW-DOCK" {
		t.Errorf("top suggestion = %s, want HW-DOCK", out.Data[0].SKU)
	}
}
