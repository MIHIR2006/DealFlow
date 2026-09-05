//go:build integration

package http_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/auth"
)

// issueToken mints a portal token for a seeded quotation, the way the send
// step will once Phase 9 wires it.
func (h *harness) issueToken(t *testing.T, reference string, ttl time.Duration) (token string, quotationID int64) {
	t.Helper()
	ctx := context.Background()

	var customerID int64
	err := h.pool.QueryRow(ctx,
		`SELECT id, customer_id FROM quotations WHERE reference = $1`, reference,
	).Scan(&quotationID, &customerID)
	if err != nil {
		t.Fatalf("find quotation %s: %v", reference, err)
	}

	token, err = auth.NewPortalToken()
	if err != nil {
		t.Fatalf("NewPortalToken: %v", err)
	}

	if _, err := h.q.CreatePortalToken(ctx, sqlcgen.CreatePortalTokenParams{
		Token:       token,
		QuotationID: quotationID,
		CustomerID:  customerID,
		ExpiresAt:   time.Now().Add(ttl),
	}); err != nil {
		t.Fatalf("CreatePortalToken: %v", err)
	}
	return token, quotationID
}

func TestPortalTokenOpensItsOwnQuotation(t *testing.T) {
	h := newHarness(t)
	token, _ := h.issueToken(t, "Q-9001", time.Hour)

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["reference"] != "Q-9001" {
		t.Errorf("reference = %v, want Q-9001", got["reference"])
	}
}

// The security claim, demonstrated: a token issued for one quotation cannot
// be made to return another. There is no quotation id in the request for an
// attacker to change, so the only thing they can tamper with is the token
// itself, and a token names exactly one quotation.
func TestPortalTokenCannotReachAnotherQuotation(t *testing.T) {
	h := newHarness(t)

	tokenA, idA := h.issueToken(t, "Q-9001", time.Hour)
	tokenB, idB := h.issueToken(t, "Q-9005", time.Hour)

	if idA == idB {
		t.Fatal("the two seeded quotations are the same record; this test proves nothing")
	}

	fetch := func(token string) map[string]any {
		w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", w.Code, w.Body)
		}
		var got map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return got
	}

	a, b := fetch(tokenA), fetch(tokenB)

	if a["reference"] == b["reference"] {
		t.Fatalf("both tokens returned %v; they must be scoped to different quotations", a["reference"])
	}
	if a["reference"] != "Q-9001" || b["reference"] != "Q-9005" {
		t.Errorf("tokens resolved to %v and %v, want Q-9001 and Q-9005", a["reference"], b["reference"])
	}

	// Appending or substituting an id must not change what comes back: the
	// route has no id parameter to influence.
	for _, path := range []string{
		"/api/v1/portal/q/" + tokenA + "?quotation_id=" + itoa(idB),
		"/api/v1/portal/q/" + tokenA + "?id=" + itoa(idB),
	} {
		w := h.do(http.MethodGet, path, "", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s = %d", path, w.Code)
		}
		var got map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &got)
		if got["reference"] != "Q-9001" {
			t.Errorf("%s returned %v; a query parameter influenced the lookup", path, got["reference"])
		}
	}
}

// A customer must never see what the deal costs us or how close their
// discount is to an internal ceiling.
func TestPortalResponseHidesInternalFields(t *testing.T) {
	h := newHarness(t)
	token, _ := h.issueToken(t, "Q-9005", time.Hour)

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	for _, leaked := range []string{
		"cost_total", "margin_amount", "margin_pct",
		"blended_risk_score", "max_line_overage", "required_level",
		"risk_rationale", "matched_policy_id", "rep_id", "rep_name",
	} {
		if _, present := got[leaked]; present {
			t.Errorf("the portal response exposes %q", leaked)
		}
	}
}

func TestUnknownExpiredAndRevokedTokensAllLookTheSame(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	expired, _ := h.issueToken(t, "Q-9001", -time.Hour)

	revoked, quotationID := h.issueToken(t, "Q-9005", time.Hour)
	if _, err := h.q.RevokePortalTokensForQuotation(ctx, quotationID); err != nil {
		t.Fatalf("RevokePortalTokensForQuotation: %v", err)
	}

	unknown, err := auth.NewPortalToken()
	if err != nil {
		t.Fatalf("NewPortalToken: %v", err)
	}

	// All three return 404, not 401 or 410. Distinguishing them would confirm
	// which tokens exist.
	for name, token := range map[string]string{
		"unknown": unknown,
		"expired": expired,
		"revoked": revoked,
	} {
		t.Run(name, func(t *testing.T) {
			w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
			if w.Code != http.StatusNotFound {
				t.Errorf("status = %d, want 404", w.Code)
			}
			if got := errorCode(t, w); got != "NOT_FOUND" {
				t.Errorf("code = %q, want NOT_FOUND", got)
			}
		})
	}
}

// A portal token is not a staff credential and must not open internal routes.
func TestPortalTokenIsUselessOnInternalRoutes(t *testing.T) {
	h := newHarness(t)
	token, _ := h.issueToken(t, "Q-9001", time.Hour)

	w := h.do(http.MethodGet, "/api/v1/auth/me", token, nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("a portal token on /auth/me = %d, want 401", w.Code)
	}
}

// Staff tokens are not portal tokens either: the portal route ignores the
// Authorization header entirely.
func TestStaffTokenDoesNotOpenThePortal(t *testing.T) {
	h := newHarness(t)
	staff := h.login(t, "admin@dealflow360.test")

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+staff, "", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("a staff JWT used as a portal token = %d, want 404", w.Code)
	}
}

func itoa(v int64) string {
	const digits = "0123456789"
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = digits[v%10]
		v /= 10
	}
	return string(buf[i:])
}
