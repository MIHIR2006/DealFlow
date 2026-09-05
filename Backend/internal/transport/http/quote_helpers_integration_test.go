//go:build integration

package http_test

import (
	"net/http"
	"testing"

	"dealflow360/backend/internal/transport/http/dto"
)

// quoteBody and orderBody are the exact JSON shapes the API returns. Aliasing
// the DTOs directly, rather than redeclaring their fields, means a test can
// never drift from what the handler actually sends.
type quoteBody = dto.Quotation
type orderBody = dto.SalesOrder

// newQuote opens a draft quotation for a customer found by name, the way a
// human reading a test would refer to one.
func newQuote(t *testing.T, h *harness, token, customerName string) quoteBody {
	t.Helper()

	var customerID int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM customers WHERE name = $1`, customerName).Scan(&customerID); err != nil {
		t.Fatalf("find customer %q: %v", customerName, err)
	}

	w := h.do(http.MethodPost, "/api/v1/quotations", token, map[string]any{"customer_id": customerID})
	if w.Code != http.StatusCreated {
		t.Fatalf("create quotation = %d: %s", w.Code, w.Body)
	}

	var q quoteBody
	decodeJSON(t, w, &q)
	return q
}

// addLine appends a product to a quotation's cart and returns the
// recalculated document.
func addLine(t *testing.T, h *harness, token string, quotationID, productID int64, qty, discountPct string) quoteBody {
	t.Helper()

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(quotationID)+"/lines", token, map[string]any{
		"product_id": productID, "qty": qty, "discount_pct": discountPct,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("add line = %d: %s", w.Code, w.Body)
	}

	var q quoteBody
	decodeJSON(t, w, &q)
	return q
}

// approvedQuote builds a quotation from the given product quantities, all at
// zero discount, and submits it. Zero discount never trips the risk engine,
// so the quotation clears straight through to APPROVED with no reviewer
// involved — this is for tests whose subject is what happens after approval,
// not the governance engine itself.
func approvedQuote(t *testing.T, h *harness, rep string, lines map[int64]string) quoteBody {
	t.Helper()

	q := newQuote(t, h, rep, "Acme Corporation")
	for productID, qty := range lines {
		addLine(t, h, rep, q.ID, productID, qty, "0")
	}

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}

	var out quoteBody
	decodeJSON(t, w, &out)
	if out.Status != "APPROVED" {
		t.Fatalf("approvedQuote: status = %s, want APPROVED (the given quantities tripped the risk engine)", out.Status)
	}
	return out
}
