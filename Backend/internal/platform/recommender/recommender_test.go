package recommender

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSuggestParsesRankedResponse(t *testing.T) {
	var got recommendRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/recommend" {
			t.Errorf("path = %q, want /recommend", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("decode request: %v", err)
		}
		_, _ = w.Write([]byte(`{"suggestions":[
			{"product_id":7,"name":"Rack","is_promoted":true,"margin_pct":41.2,"confidence":0.62,"co_purchase_count":9},
			{"product_id":3,"name":"Cable","is_promoted":false,"margin_pct":33.0,"confidence":0.41,"co_purchase_count":4}
		]}`))
	}))
	defer srv.Close()

	out, err := New(srv.URL+"/", time.Second).Suggest(context.Background(), 42, []int64{1, 2}, 5)
	if err != nil {
		t.Fatalf("Suggest: %v", err)
	}

	if got.QuotationID == nil || *got.QuotationID != 42 {
		t.Errorf("quotation_id = %v, want 42", got.QuotationID)
	}
	if len(got.ProductIDs) != 2 || got.TopN != 5 {
		t.Errorf("request = %+v, want product_ids [1 2] and top_n 5", got)
	}

	// The engine's order is its ranking, and must survive the round trip.
	if len(out) != 2 || out[0].ProductID != 7 || out[1].ProductID != 3 {
		t.Fatalf("suggestions = %+v, want product ids 7 then 3", out)
	}
	if !out[0].IsPromoted || out[0].CoPurchaseCount != 9 {
		t.Errorf("first suggestion = %+v, want promoted with 9 co-purchases", out[0])
	}
	if out[0].Confidence.String() != "0.62" {
		t.Errorf("confidence = %s, want 0.62", out[0].Confidence)
	}
}

func TestSuggestClampsTopNToEngineCeiling(t *testing.T) {
	var got recommendRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		_, _ = w.Write([]byte(`{"suggestions":[]}`))
	}))
	defer srv.Close()

	// The engine rejects top_n above 20 as a validation error, so asking for
	// more must be clamped rather than turned into a 422.
	if _, err := New(srv.URL, time.Second).Suggest(context.Background(), 1, []int64{1}, 500); err != nil {
		t.Fatalf("Suggest: %v", err)
	}
	if got.TopN != maxTopN {
		t.Errorf("top_n = %d, want %d", got.TopN, maxTopN)
	}
}

func TestSuggestReportsEngineFailures(t *testing.T) {
	// Every one of these is a "no signal" answer for the caller, which falls
	// back to the rules-based ranking rather than failing the request.
	t.Run("error status", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"detail":"boom"}`, http.StatusInternalServerError)
		}))
		defer srv.Close()

		if _, err := New(srv.URL, time.Second).Suggest(context.Background(), 1, []int64{1}, 5); err == nil {
			t.Fatal("want an error for a 500 from the engine")
		}
	})

	t.Run("malformed body", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("not json"))
		}))
		defer srv.Close()

		if _, err := New(srv.URL, time.Second).Suggest(context.Background(), 1, []int64{1}, 5); err == nil {
			t.Fatal("want an error for a body that is not JSON")
		}
	})

	t.Run("timeout", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(200 * time.Millisecond)
		}))
		defer srv.Close()

		if _, err := New(srv.URL, 20*time.Millisecond).Suggest(context.Background(), 1, []int64{1}, 5); err == nil {
			t.Fatal("want an error when the engine outruns the timeout")
		}
	})
}

func TestSuggestSkipsTheCallWithAnEmptyCart(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("engine must not be called for an empty cart")
	}))
	defer srv.Close()

	out, err := New(srv.URL, time.Second).Suggest(context.Background(), 1, nil, 5)
	if err != nil || len(out) != 0 {
		t.Fatalf("Suggest(nil) = %v, %v; want no suggestions and no error", out, err)
	}
}
