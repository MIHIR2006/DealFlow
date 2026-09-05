//go:build integration

package http_test

import (
	"net/http"
	"strings"
	"testing"
)

// threadBody mirrors the internal negotiation panel.
type threadBody struct {
	QuotationID int64  `json:"quotation_id"`
	Reference   string `json:"reference"`
	Status      string `json:"status"`
	Negotiable  bool   `json:"negotiable"`

	Messages []struct {
		ID          int64   `json:"id"`
		LineID      *int64  `json:"line_id"`
		ProductName *string `json:"product_name"`
		AuthorType  string  `json:"author_type"`
		AuthorLabel string  `json:"author_label"`
		Body        string  `json:"body"`
	} `json:"messages"`

	CounterOffers []struct {
		ProposedDiscountPct string `json:"proposed_discount_pct"`
		Outcome             string `json:"outcome"`
	} `json:"counter_offers"`
}

func getThread(t *testing.T, h *harness, token string, quotationID int64) threadBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(quotationID)+"/negotiation", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("thread = %d: %s", w.Code, w.Body)
	}
	var out threadBody
	decodeJSON(t, w, &out)
	return out
}

func postPortalMessage(t *testing.T, h *harness, portalToken, body string) {
	t.Helper()

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/messages", "",
		map[string]any{"body": body})
	if w.Code != http.StatusCreated {
		t.Fatalf("customer message = %d: %s", w.Code, w.Body)
	}
}

// The conversation has two ends.
//
// A customer message used to land in a table nothing internal ever read, while
// the portal told them their sales team had been notified. This is that claim
// made true: the rep sees it, answers, and the answer comes back on the
// customer's own side of the thread.
func TestNegotiationThreadRunsBothWays(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	postPortalMessage(t, h, portalToken, "Can you split delivery across two sites?")

	// The rep sees what the customer said.
	thread := getThread(t, h, rep, q.ID)
	if len(thread.Messages) != 1 {
		t.Fatalf("messages = %d, want the customer's one: %+v", len(thread.Messages), thread.Messages)
	}
	if thread.Messages[0].AuthorType != "CUSTOMER" {
		t.Errorf("author_type = %s, want CUSTOMER", thread.Messages[0].AuthorType)
	}
	if !thread.Negotiable {
		t.Error("a sent quotation must accept a reply")
	}

	// The rep answers.
	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/messages", rep,
		map[string]any{"body": "Yes — we can ship to both sites at no extra cost."})
	if w.Code != http.StatusCreated {
		t.Fatalf("staff reply = %d: %s", w.Code, w.Body)
	}
	var replied threadBody
	decodeJSON(t, w, &replied)
	if len(replied.Messages) != 2 {
		t.Fatalf("messages after reply = %d, want 2", len(replied.Messages))
	}
	staff := replied.Messages[1]
	if staff.AuthorType != "STAFF" {
		t.Errorf("author_type = %s, want STAFF", staff.AuthorType)
	}
	// The customer sees this label, so it must be a name and not an email.
	if staff.AuthorLabel == "" || strings.Contains(staff.AuthorLabel, "@") {
		t.Errorf("author_label = %q, want a person's name and no email address", staff.AuthorLabel)
	}

	// And it arrives on the customer's side of the portal.
	view := portalGet(t, h, portalToken)
	if len(view.Messages) != 2 {
		t.Fatalf("portal messages = %d, want 2", len(view.Messages))
	}
	if view.Messages[1].AuthorType != "STAFF" {
		t.Errorf("portal message author_type = %s, want STAFF", view.Messages[1].AuthorType)
	}
	if view.Messages[1].Body != "Yes — we can ship to both sites at no extra cost." {
		t.Errorf("portal message body = %q, not what the rep sent", view.Messages[1].Body)
	}
}

// A reply about one line carries which line, so the internal thread can say
// what a comment was about without the client joining anything.
func TestStaffReplyCanBeScopedToALine(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, _ := sentQuote(t, h, rep, "5")
	lineID := q.Lines[0].ID

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/messages", rep,
		map[string]any{"body": "This line ships from the Pune warehouse.", "line_id": lineID})
	if w.Code != http.StatusCreated {
		t.Fatalf("staff reply = %d: %s", w.Code, w.Body)
	}

	thread := getThread(t, h, rep, q.ID)
	m := thread.Messages[0]
	if m.LineID == nil || *m.LineID != lineID {
		t.Fatalf("line_id = %v, want %d", m.LineID, lineID)
	}
	if m.ProductName == nil || *m.ProductName == "" {
		t.Error("a line-scoped message must name the product")
	}
}

// The reply composer is bounded by the same rule the customer is: while terms
// are under approval, neither side may move them.
func TestStaffCannotReplyWhileTermsAreUnderApproval(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	// A counter-offer beyond policy puts the deal back into approval.
	w := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/counter-offer", "",
		map[string]any{"proposed_discount_pct": "35", "note": "budget"})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}

	thread := getThread(t, h, rep, q.ID)
	if thread.Status != "PENDING_APPROVAL" || thread.Negotiable {
		t.Fatalf("thread = status %s negotiable %v, want PENDING_APPROVAL and not negotiable",
			thread.Status, thread.Negotiable)
	}

	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/messages", rep,
		map[string]any{"body": "trying anyway"}).Code; got != http.StatusConflict {
		t.Errorf("staff reply while under approval = %d, want 409", got)
	}
}

// A rep may not read the negotiation of a deal that is not theirs. The thread
// borrows the quotation service's visibility rules rather than adding its own.
func TestNegotiationThreadRespectsQuotationVisibility(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	q, _ := sentQuote(t, h, rep, "5")

	// Finance oversees everything, so it may look.
	if got := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID)+"/negotiation", finance, nil).Code; got != http.StatusOK {
		t.Errorf("finance reading the thread = %d, want 200", got)
	}
	// An unauthenticated caller may not.
	if got := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID)+"/negotiation", "", nil).Code; got != http.StatusUnauthorized {
		t.Errorf("anonymous reading the thread = %d, want 401", got)
	}
}

// The state the whole negotiation exists to reach.
//
// A customer proposes beyond policy, the deal routes, a manager and finance
// approve. The customer was told they would be able to confirm once that
// completed -- and this is that promise being kept. It used to fail: APPROVED
// fell through to "no longer open for confirmation", stranding a customer
// whose own counter-offer had just been approved.
func TestCustomerCanConfirmOnceTheirCounterOfferIsApproved(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/counter-offer", "",
		map[string]any{"proposed_discount_pct": "35", "note": "budget pressure"})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}
	var routed portalBody
	decodeJSON(t, w, &routed)
	if routed.CounterOffers[0].Outcome != "ROUTED_FOR_APPROVAL" {
		t.Fatalf("outcome = %s, want ROUTED_FOR_APPROVAL", routed.CounterOffers[0].Outcome)
	}
	if routed.CanConfirm {
		t.Error("a customer must not confirm terms nobody internally has agreed to")
	}

	// Clear every step of the chain.
	quotationID := q.ID
	for _, token := range []string{manager, finance} {
		id := pendingStepID(t, h, quotationID)
		if id == 0 {
			break
		}
		if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(id)+"/approve", token, nil).Code; got != http.StatusOK {
			t.Fatalf("approve step %d = %d", id, got)
		}
	}

	after := portalGet(t, h, portalToken)
	if after.Status != "APPROVED" {
		t.Fatalf("status = %s, want APPROVED", after.Status)
	}
	if after.AwaitingReview {
		t.Error("awaiting_review is still set after the decision")
	}
	if !after.CanConfirm {
		t.Fatal("the customer cannot confirm terms their own counter-offer just won")
	}

	// The proposal must show its answer rather than sitting on "under review".
	if after.CounterOffers[0].Outcome != "APPROVED" {
		t.Errorf("counter-offer outcome = %s, want APPROVED", after.CounterOffers[0].Outcome)
	}

	// And confirming actually works.
	if got := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/confirm", "", nil).Code; got != http.StatusOK {
		t.Fatalf("confirm after approval = %d, want 200", got)
	}
	if final := portalGet(t, h, portalToken); final.Status != "CONFIRMED" {
		t.Errorf("status = %s, want CONFIRMED", final.Status)
	}
}

// A rejected proposal must say so, rather than leaving the customer reading
// "under review" forever.
func TestRejectedCounterOfferIsReportedToTheCustomer(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	w := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/counter-offer", "",
		map[string]any{"proposed_discount_pct": "35", "note": "budget pressure"})
	if w.Code != http.StatusOK {
		t.Fatalf("counter-offer = %d: %s", w.Code, w.Body)
	}
	var routed portalBody
	decodeJSON(t, w, &routed)

	stepID := pendingStepID(t, h, q.ID)
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(stepID)+"/reject", manager,
		map[string]any{"reason": "margin floor"}).Code; got != http.StatusOK {
		t.Fatalf("reject = %d", got)
	}

	after := portalGet(t, h, portalToken)
	if after.CounterOffers[0].Outcome != "REJECTED" {
		t.Errorf("counter-offer outcome = %s, want REJECTED", after.CounterOffers[0].Outcome)
	}
	if after.CanConfirm {
		t.Error("a rejected quotation must not be confirmable")
	}
}
