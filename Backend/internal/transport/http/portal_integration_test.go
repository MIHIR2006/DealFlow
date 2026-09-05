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

type portalBody struct {
	Reference        string `json:"reference"`
	Status           string `json:"status"`
	CustomerName     string `json:"customer_name"`
	CustomerEmail    string `json:"customer_email"`
	OrderDiscountPct string `json:"order_discount_pct"`
	AwaitingReview   bool   `json:"awaiting_review"`
	CanConfirm       bool   `json:"can_confirm"`

	Lines []struct {
		ID          int64  `json:"id"`
		ProductName string `json:"product_name"`
		Qty         string `json:"qty"`
		UnitPrice   string `json:"unit_price"`
		DiscountPct string `json:"discount_pct"`
		NetAmount   string `json:"net_amount"`
		LineType    string `json:"line_type"`
	} `json:"lines"`

	Totals struct {
		NetSubtotal string `json:"net_subtotal"`
		GrandTotal  string `json:"grand_total"`
	} `json:"totals"`

	Messages []struct {
		AuthorType  string `json:"author_type"`
		AuthorLabel string `json:"author_label"`
		Body        string `json:"body"`
	} `json:"messages"`

	CounterOffers []struct {
		PreviousDiscountPct string `json:"previous_discount_pct"`
		ProposedDiscountPct string `json:"proposed_discount_pct"`
		Outcome             string `json:"outcome"`
	} `json:"counter_offers"`
}

// sentQuote takes a compliant quotation through approval and out to the
// portal, returning the token a customer would receive.
func sentQuote(t *testing.T, h *harness, rep string, discountPct string) (quoteBody, string) {
	t.Helper()

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "2", discountPct)

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)
	if q.Status != "APPROVED" {
		t.Fatalf("status = %s, want APPROVED (the fixture must be compliant)", q.Status)
	}

	w = h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/send", rep, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("send = %d: %s", w.Code, w.Body)
	}
	var sent struct {
		Token string `json:"token"`
	}
	decodeJSON(t, w, &sent)
	if sent.Token == "" {
		t.Fatal("send returned no token")
	}
	return q, sent.Token
}

func portalGet(t *testing.T, h *harness, token string) portalBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("portal view = %d: %s", w.Code, w.Body)
	}
	var p portalBody
	decodeJSON(t, w, &p)
	return p
}

// The loop the whole product exists for.
//
// A customer proposes terms beyond policy. Nobody forwards it, nobody decides
// to escalate: the quotation re-enters the approval chain by itself, and the
// manager finds it waiting in their inbox.
func TestCounterOfferBeyondPolicyReEntersApprovalOnItsOwn(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q, token := sentQuote(t, h, rep, "8")

	before := portalGet(t, h, token)
	if before.Status != "SENT" || !before.CanConfirm {
		t.Fatalf("status = %s canConfirm = %v, want SENT and confirmable",
			before.Status, before.CanConfirm)
	}
	managerInboxBefore := inboxCount(t, h, manager)

	// Gold allows 15%. Asking for 25% is 10 points past it.
	w := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/counter-offer", "", map[string]any{
		"line_id":               before.Lines[0].ID,
		"proposed_discount_pct": "25",
		"note":                  "A competitor quoted lower",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}

	var after portalBody
	decodeJSON(t, w, &after)

	if after.Status != "PENDING_APPROVAL" {
		t.Fatalf("status = %s, want PENDING_APPROVAL", after.Status)
	}
	if !after.AwaitingReview {
		t.Error("the customer is not told their proposal is under review")
	}
	if after.CanConfirm {
		t.Error("the customer can still confirm terms nobody has agreed to")
	}
	if len(after.CounterOffers) != 1 || after.CounterOffers[0].Outcome != "ROUTED_FOR_APPROVAL" {
		t.Errorf("counter offers = %+v, want one routed for approval", after.CounterOffers)
	}

	// A chain exists and is waiting, with no staff action having occurred.
	if got := inboxCount(t, h, manager); got != managerInboxBefore+1 {
		t.Errorf("manager inbox = %d, want %d; the deal did not route itself",
			got, managerInboxBefore+1)
	}

	// And the trail says why.
	w = h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID), rep, nil)
	decodeJSON(t, w, &q)

	var found bool
	for _, a := range q.Audit {
		if a.Action == "COUNTER_OFFER" {
			found = true
			if a.Note == "" {
				t.Error("the counter-offer entry has no note")
			}
		}
	}
	if !found {
		t.Error("no COUNTER_OFFER entry in the audit trail")
	}
}

// Within policy the quotation simply updates. Escalating everything would
// make the governance engine pointless.
func TestCounterOfferWithinPolicyIsAcceptedWithoutApproval(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "5")
	before := portalGet(t, h, token)

	// Gold allows 15%; asking for 12% stays inside it.
	w := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/counter-offer", "", map[string]any{
		"line_id":               before.Lines[0].ID,
		"proposed_discount_pct": "12",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}

	var after portalBody
	decodeJSON(t, w, &after)

	if after.Status != "UNDER_NEGOTIATION" {
		t.Errorf("status = %s, want UNDER_NEGOTIATION", after.Status)
	}
	if after.AwaitingReview {
		t.Error("a within-policy proposal was sent for review")
	}
	if !after.CanConfirm {
		t.Error("the customer cannot confirm terms that were accepted")
	}
	if after.CounterOffers[0].Outcome != "AUTO_ACCEPTED" {
		t.Errorf("outcome = %s, want AUTO_ACCEPTED", after.CounterOffers[0].Outcome)
	}
	// The new price is reflected immediately.
	if after.Lines[0].DiscountPct != "12" {
		t.Errorf("discount = %s, want 12", after.Lines[0].DiscountPct)
	}
}

// The full round trip: customer counters, a manager approves the new terms,
// the customer confirms.
func TestNegotiationRoundTripEndsInConfirmation(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q, token := sentQuote(t, h, rep, "8")
	before := portalGet(t, h, token)

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/counter-offer", "", map[string]any{
		"line_id":               before.Lines[0].ID,
		"proposed_discount_pct": "18",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}

	// Confirming while it is under review would let the customer accept
	// terms nobody internally has agreed to.
	early := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/confirm", "", nil)
	if early.Code != http.StatusConflict {
		t.Errorf("confirming during review = %d, want 409: %s", early.Code, early.Body)
	}

	// The manager approves the customer's terms. The quotation was compliant
	// when first submitted, so this is its first chain, not its second.
	step := pendingStepID(t, h, q.ID)
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(step)+"/approve", manager,
		map[string]string{"reason": "Accepting the customer's terms"}).Code; got != http.StatusOK {
		t.Fatalf("approve = %d", got)
	}

	// Approval returns it to APPROVED; the rep sends it back out.
	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/send", rep, nil).Code; got != http.StatusCreated {
		t.Fatalf("resend = %d", got)
	}

	// A fresh link, because sending revokes the previous one.
	var newToken string
	if err := h.pool.QueryRow(t.Context(),
		`SELECT token FROM portal_tokens
		  WHERE quotation_id = $1 AND revoked_at IS NULL
		  ORDER BY id DESC LIMIT 1`, q.ID).Scan(&newToken); err != nil {
		t.Fatalf("find new token: %v", err)
	}

	w = h.do(http.MethodPost, "/api/v1/portal/q/"+newToken+"/confirm", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("confirm = %d: %s", w.Code, w.Body)
	}

	var confirmed portalBody
	decodeJSON(t, w, &confirmed)
	if confirmed.Status != "CONFIRMED" {
		t.Errorf("status = %s, want CONFIRMED", confirmed.Status)
	}
	// The negotiated discount survived into the confirmed quotation.
	if confirmed.Lines[0].DiscountPct != "18" {
		t.Errorf("discount = %s, want the negotiated 18", confirmed.Lines[0].DiscountPct)
	}
}

// An approval given for one set of terms must not carry over to different
// ones.
func TestCounterOfferSupersedesApprovalsAlreadyGiven(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	// A quotation that needed both approvers, both of whom signed.
	q := flaggedQuote(t, h, rep)
	m := stepID(t, h, q.ID, 1, 1)
	f := stepID(t, h, q.ID, 1, 2)
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(m)+"/approve", manager, nil).Code; got != http.StatusOK {
		t.Fatalf("manager approve = %d", got)
	}
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(f)+"/approve", finance, nil).Code; got != http.StatusOK {
		t.Fatalf("finance approve = %d", got)
	}

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/send", rep, nil)
	var sent struct {
		Token string `json:"token"`
	}
	decodeJSON(t, w, &sent)

	view := portalGet(t, h, sent.Token)
	w = h.do(http.MethodPost, "/api/v1/portal/q/"+sent.Token+"/counter-offer", "", map[string]any{
		"line_id":               view.Lines[0].ID,
		"proposed_discount_pct": "30",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}

	w = h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID), rep, nil)
	decodeJSON(t, w, &q)

	// The new chain starts at step one. The earlier approvals are still on
	// record, but they were for terms that no longer exist.
	rounds := map[int32][]string{}
	for _, a := range q.Approvals {
		rounds[a.Round] = append(rounds[a.Round], a.Status)
	}
	if len(rounds) < 2 {
		t.Fatalf("expected a new round after the counter-offer, got %v", rounds)
	}

	var pending int
	for _, a := range q.Approvals {
		if a.Status == "PENDING" {
			pending++
			if a.Round == 1 {
				t.Error("a step from the original round is still pending")
			}
		}
	}
	if pending == 0 {
		t.Error("the rebuilt chain has nothing awaiting a decision")
	}
	// Round one's approvals survive as history.
	for _, status := range rounds[1] {
		if status != "APPROVED" {
			t.Errorf("round 1 status = %s, want the original approvals preserved", status)
		}
	}
}

func TestCustomerCanCommentOnALine(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "5")
	view := portalGet(t, h, token)

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/messages", "", map[string]any{
		"line_id": view.Lines[0].ID,
		"body":    "Can this ship before the end of the quarter?",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("message = %d: %s", w.Code, w.Body)
	}

	var after portalBody
	decodeJSON(t, w, &after)
	if len(after.Messages) != 1 {
		t.Fatalf("messages = %d, want 1", len(after.Messages))
	}
	if after.Messages[0].AuthorType != "CUSTOMER" {
		t.Errorf("author type = %s, want CUSTOMER", after.Messages[0].AuthorType)
	}
	if after.Messages[0].AuthorLabel != "Acme Corporation" {
		t.Errorf("author = %s, want the customer's name", after.Messages[0].AuthorLabel)
	}
}

// A customer under discussion is not a stalled deal.
func TestCustomerActivityKeepsTheDealOffTheStalledList(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, token := sentQuote(t, h, rep, "5")

	// Age the quotation past the stall window.
	if _, err := h.pool.Exec(t.Context(),
		`UPDATE quotations SET last_activity_at = now() - interval '30 days' WHERE id = $1`,
		q.ID); err != nil {
		t.Fatalf("age quotation: %v", err)
	}

	if got := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/messages", "",
		map[string]any{"body": "Still interested, checking budget"}).Code; got != http.StatusCreated {
		t.Fatalf("message = %d", got)
	}

	var age float64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT EXTRACT(EPOCH FROM (now() - last_activity_at)) FROM quotations WHERE id = $1`,
		q.ID).Scan(&age); err != nil {
		t.Fatalf("read activity: %v", err)
	}
	if age > 60 {
		t.Errorf("last activity is %.0f seconds old; the comment did not count as activity", age)
	}
}

// The customer must never learn what the deal costs us or how close their
// discount sits to an internal limit.
func TestPortalNeverExposesInternalFacts(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "8")

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	var raw map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode: %v", err)
	}

	for _, leaked := range []string{
		"cost_total", "margin_amount", "margin_pct", "risk",
		"blended_risk_score", "max_line_overage", "required_level",
		"risk_rationale", "matched_policy_id", "rep_id", "rep_name", "approvals",
	} {
		if _, present := raw[leaked]; present {
			t.Errorf("the portal document exposes %q", leaked)
		}
	}

	lines, _ := raw["lines"].([]any)
	for _, l := range lines {
		line, _ := l.(map[string]any)
		for _, leaked := range []string{
			"unit_cost", "cost_amount", "margin_amount", "margin_pct",
			"ceiling_pct", "overage_pts", "line_discount_pct",
		} {
			if _, present := line[leaked]; present {
				t.Errorf("a portal line exposes %q", leaked)
			}
		}
	}

	// The body must not contain the internal risk figures anywhere at all.
	for _, needle := range []string{"ceiling", "overage", "margin", "blended"} {
		if bytesContainsFold(w.Body.Bytes(), needle) {
			t.Errorf("the portal response mentions %q", needle)
		}
	}
}

// The portal screen identifies the account a link belongs to and shows what an
// order-wide counter-offer would move away from. Both are the customer's own
// commercial facts. Their tier is not: it is an input to our discount policy,
// and a customer who knows they are Gold knows which ceiling to push against.
func TestPortalIdentifiesTheAccountWithoutRevealingItsTier(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "8")

	p := portalGet(t, h, token)
	if p.CustomerEmail == "" {
		t.Error("the portal document does not identify the account it was issued to")
	}
	if p.OrderDiscountPct == "" {
		t.Error("the portal document omits the order discount a counter-offer would replace")
	}

	w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
	var raw map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, leaked := range []string{"customer_tier", "tier"} {
		if _, present := raw[leaked]; present {
			t.Errorf("the portal document exposes %q", leaked)
		}
	}
}

func TestPortalWritesAreRefusedOnAClosedQuotation(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "5")

	if got := h.do(http.MethodPost, "/api/v1/portal/q/"+token+"/confirm", "", nil).Code; got != http.StatusOK {
		t.Fatalf("confirm = %d", got)
	}

	// Nothing more may happen once the customer has accepted.
	for name, path := range map[string]string{
		"message":       "/messages",
		"counter-offer": "/counter-offer",
		"confirm again": "/confirm",
	} {
		t.Run(name, func(t *testing.T) {
			body := map[string]any{"body": "hello", "proposed_discount_pct": "20"}
			w := h.do(http.MethodPost, "/api/v1/portal/q/"+token+path, "", body)
			if w.Code != http.StatusConflict {
				t.Errorf("%s on a confirmed quotation = %d, want 409: %s", name, w.Code, w.Body)
			}
		})
	}
}

// A line id from another quotation must not be reachable through this token.
func TestPortalCannotTouchAnotherQuotationsLine(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, tokenA := sentQuote(t, h, rep, "5")
	qB, _ := sentQuote(t, h, rep, "5")

	var foreignLine int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM quotation_lines WHERE quotation_id = $1 LIMIT 1`,
		qB.ID).Scan(&foreignLine); err != nil {
		t.Fatalf("find line: %v", err)
	}

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+tokenA+"/counter-offer", "", map[string]any{
		"line_id":               foreignLine,
		"proposed_discount_pct": "40",
	})
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-quotation counter-offer = %d, want 404: %s", w.Code, w.Body)
	}
}

// Sending a fresh link invalidates the previous one, so a forwarded token
// cannot reopen a negotiation after the terms moved on.
func TestSendingANewLinkRevokesTheOldOne(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, first := sentQuote(t, h, rep, "5")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/send", rep, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("resend = %d: %s", w.Code, w.Body)
	}
	var sent struct {
		Token string `json:"token"`
	}
	decodeJSON(t, w, &sent)

	if got := h.do(http.MethodGet, "/api/v1/portal/q/"+first, "", nil).Code; got != http.StatusNotFound {
		t.Errorf("the old link still works: %d", got)
	}
	if got := h.do(http.MethodGet, "/api/v1/portal/q/"+sent.Token, "", nil).Code; got != http.StatusOK {
		t.Errorf("the new link = %d, want 200", got)
	}
}

func TestOnlyApprovedQuotationsCanBeSent(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	draft := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, draft.ID, laptop.ID, "1", "0")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(draft.ID)+"/send", rep, nil)
	if w.Code != http.StatusConflict {
		t.Errorf("sending a draft = %d, want 409: %s", w.Code, w.Body)
	}
}

// Expired, revoked and unknown tokens are indistinguishable, so the endpoint
// never confirms which links exist.
func TestExpiredRevokedAndUnknownTokensLookAlike(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	ctx := context.Background()

	q, live := sentQuote(t, h, rep, "5")

	if _, err := h.pool.Exec(ctx,
		`UPDATE portal_tokens SET expires_at = now() - interval '1 hour' WHERE token = $1`,
		live); err != nil {
		t.Fatalf("expire token: %v", err)
	}

	_, revokedQuote := sentQuote(t, h, rep, "5")
	if _, err := h.q.RevokePortalTokensForQuotation(ctx, q.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if _, err := h.pool.Exec(ctx,
		`UPDATE portal_tokens SET revoked_at = now() WHERE token = $1`, revokedQuote); err != nil {
		t.Fatalf("revoke second: %v", err)
	}

	unknown, err := auth.NewPortalToken()
	if err != nil {
		t.Fatalf("NewPortalToken: %v", err)
	}

	bodies := map[string]string{}
	for name, token := range map[string]string{
		"expired": live, "revoked": revokedQuote, "unknown": unknown,
	} {
		w := h.do(http.MethodGet, "/api/v1/portal/q/"+token, "", nil)
		if w.Code != http.StatusNotFound {
			t.Errorf("%s token = %d, want 404", name, w.Code)
		}
		bodies[name] = w.Body.String()
	}
	if bodies["expired"] != bodies["unknown"] || bodies["revoked"] != bodies["unknown"] {
		t.Errorf("the three responses differ, revealing which tokens exist: %v", bodies)
	}
}

func TestPortalTokenIsNotAStaffCredential(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, token := sentQuote(t, h, rep, "5")

	if got := h.do(http.MethodGet, "/api/v1/auth/me", token, nil).Code; got != http.StatusUnauthorized {
		t.Errorf("a portal token on /auth/me = %d, want 401", got)
	}
	if got := h.do(http.MethodGet, "/api/v1/quotations", token, nil).Code; got != http.StatusUnauthorized {
		t.Errorf("a portal token on /quotations = %d, want 401", got)
	}
}

func TestStaffTokenDoesNotOpenThePortal(t *testing.T) {
	h := newHarness(t)
	staff := h.login(t, "admin@dealflow360.test")

	if got := h.do(http.MethodGet, "/api/v1/portal/q/"+staff, "", nil).Code; got != http.StatusNotFound {
		t.Errorf("a staff JWT used as a portal token = %d, want 404", got)
	}
}

// issueToken remains available for tests that need a token without going
// through the send flow.
func (h *harness) issueToken(t *testing.T, reference string, ttl time.Duration) (string, int64) {
	t.Helper()
	ctx := context.Background()

	var quotationID, customerID int64
	if err := h.pool.QueryRow(ctx,
		`SELECT id, customer_id FROM quotations WHERE reference = $1`, reference,
	).Scan(&quotationID, &customerID); err != nil {
		t.Fatalf("find quotation %s: %v", reference, err)
	}

	token, err := auth.NewPortalToken()
	if err != nil {
		t.Fatalf("NewPortalToken: %v", err)
	}
	if _, err := h.q.CreatePortalToken(ctx, sqlcgen.CreatePortalTokenParams{
		Token: token, QuotationID: quotationID, CustomerID: customerID,
		ExpiresAt: time.Now().Add(ttl),
	}); err != nil {
		t.Fatalf("CreatePortalToken: %v", err)
	}
	return token, quotationID
}

func bytesContainsFold(haystack []byte, needle string) bool {
	h, n := string(haystack), needle
	for i := 0; i+len(n) <= len(h); i++ {
		if equalFold(h[i:i+len(n)], n) {
			return true
		}
	}
	return false
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if 'A' <= ca && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if 'A' <= cb && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}
