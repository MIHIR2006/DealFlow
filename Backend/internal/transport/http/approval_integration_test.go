//go:build integration

package http_test

import (
	"net/http"
	"testing"
)

// flaggedQuote builds and submits the worked example: a Gold customer with a
// compliant hardware line and a service line 8 points over, which routes to
// manager then finance.
func flaggedQuote(t *testing.T, h *harness, rep string) quoteBody {
	t.Helper()

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "12")
	addLine(t, h, rep, q.ID, setup.ID, "7", "18")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)
	return q
}

// stepID returns the approval id for a round and step.
func stepID(t *testing.T, h *harness, quotationID int64, round, step int32) int64 {
	t.Helper()

	var id int64
	err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM approval_requests
		 WHERE quotation_id = $1 AND round = $2 AND step = $3`,
		quotationID, round, step).Scan(&id)
	if err != nil {
		t.Fatalf("find round %d step %d: %v", round, step, err)
	}
	return id
}

// pendingStepID returns the step currently awaiting a decision, whatever
// round it belongs to. A quotation that was compliant on first submission has
// no round one, so tests must not assume a round number.
func pendingStepID(t *testing.T, h *harness, quotationID int64) int64 {
	t.Helper()

	var id int64
	err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM approval_requests
		 WHERE quotation_id = $1 AND status = 'PENDING'
		 ORDER BY round DESC, step LIMIT 1`, quotationID).Scan(&id)
	if err != nil {
		t.Fatalf("find the pending step for quotation %d: %v", quotationID, err)
	}
	return id
}

func inboxCount(t *testing.T, h *harness, token string) int {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/approvals?limit=100", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("inbox = %d: %s", w.Code, w.Body)
	}

	var page struct {
		Data []struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)
	return len(page.Data)
}

// The full chain: manager approves, then finance, and only then is the
// quotation approved.
func TestChainAdvancesOneStepAtATime(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	q := flaggedQuote(t, h, rep)

	managerStep := stepID(t, h, q.ID, 1, 1)
	financeStep := stepID(t, h, q.ID, 1, 2)

	// Finance cannot go first: it would sign off terms a manager never saw.
	early := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(financeStep)+"/approve", finance,
		map[string]string{"reason": ""})
	if early.Code != http.StatusConflict {
		t.Errorf("finance approving before the manager = %d, want 409: %s", early.Code, early.Body)
	}

	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", manager,
		map[string]string{"reason": "Margin acceptable for this account"})
	if w.Code != http.StatusOK {
		t.Fatalf("manager approve = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	// One step down, one to go: the quotation has not moved yet.
	if q.Status != "PENDING_APPROVAL" {
		t.Errorf("status after the first approval = %s, want PENDING_APPROVAL", q.Status)
	}
	if q.Approvals[0].Status != "APPROVED" {
		t.Errorf("step 1 = %s, want APPROVED", q.Approvals[0].Status)
	}
	if q.Approvals[1].Status != "PENDING" {
		t.Errorf("step 2 = %s, want PENDING", q.Approvals[1].Status)
	}

	w = h.do(http.MethodPost, "/api/v1/approvals/"+itoa(financeStep)+"/approve", finance, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("finance approve = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Status != "APPROVED" {
		t.Errorf("status after the last approval = %s, want APPROVED", q.Status)
	}
	for _, a := range q.Approvals {
		if a.Status != "APPROVED" {
			t.Errorf("step %d = %s, want APPROVED", a.Step, a.Status)
		}
	}
}

// The mockup's approval screen shows three audit rows: submitted, returned,
// resubmitted. Reproducing that exactly means the return loop works and the
// trail survives a superseded round.
func TestReturnForRevisionKeepsTheWholeHistory(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q := flaggedQuote(t, h, rep)
	managerStep := stepID(t, h, q.ID, 1, 1)

	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/return", manager,
		map[string]string{"reason": "Requested justification"})
	if w.Code != http.StatusOK {
		t.Fatalf("return = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	// Returned is not rejected: the deal is alive and back with the rep.
	if q.Status != "DRAFT" {
		t.Fatalf("status after a return = %s, want DRAFT", q.Status)
	}
	if q.Approvals[0].Status != "RETURNED" {
		t.Errorf("step 1 = %s, want RETURNED", q.Approvals[0].Status)
	}
	// The finance step never ran; the terms it would have reviewed are about
	// to change.
	if q.Approvals[1].Status != "SUPERSEDED" {
		t.Errorf("step 2 = %s, want SUPERSEDED", q.Approvals[1].Status)
	}

	// The rep revises and resubmits.
	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "5")

	w = h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("resubmit = %d: %s", w.Code, w.Body)
	}

	w = h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID), rep, nil)
	decodeJSON(t, w, &q)

	// Both rounds survive. Nothing is deleted.
	rounds := map[int32]int{}
	for _, a := range q.Approvals {
		rounds[a.Round]++
	}
	if len(rounds) != 2 {
		t.Errorf("found %d rounds, want 2 (the returned one and the new one)", len(rounds))
	}

	// The trail reads submitted, returned, resubmitted, exactly as the
	// approval screen shows it.
	var sequence []string
	for i := len(q.Audit) - 1; i >= 0; i-- { // the trail is newest first
		switch q.Audit[i].Action {
		case "SUBMITTED", "RETURNED":
			sequence = append(sequence, q.Audit[i].Action)
		}
	}
	want := []string{"SUBMITTED", "RETURNED", "SUBMITTED"}
	if len(sequence) != len(want) {
		t.Fatalf("trail = %v, want %v", sequence, want)
	}
	for i := range want {
		if sequence[i] != want[i] {
			t.Errorf("trail = %v, want %v", sequence, want)
			break
		}
	}

	// The reason the manager gave is recorded, not just the fact of a return.
	var foundReason bool
	for _, a := range q.Audit {
		if a.Action == "RETURNED" && a.Note == "Requested justification" {
			foundReason = true
		}
	}
	if !foundReason {
		t.Error("the manager's reason is missing from the trail")
	}
}

func TestRejectionClosesTheDeal(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q := flaggedQuote(t, h, rep)
	managerStep := stepID(t, h, q.ID, 1, 1)

	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/reject", manager,
		map[string]string{"reason": "Margin below the floor for this segment"})
	if w.Code != http.StatusOK {
		t.Fatalf("reject = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Status != "REJECTED" {
		t.Errorf("status = %s, want REJECTED", q.Status)
	}
	if q.Approvals[1].Status != "SUPERSEDED" {
		t.Errorf("the finance step = %s, want SUPERSEDED", q.Approvals[1].Status)
	}

	// A rejected quotation is closed: it cannot be edited back to life.
	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	edit := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep,
		map[string]any{"product_id": laptop.ID, "qty": "1", "discount_pct": "0"})
	if edit.Code != http.StatusConflict {
		t.Errorf("editing a rejected quotation = %d, want 409", edit.Code)
	}
}

// The rule the whole governance model rests on.
func TestNobodyApprovesTheirOwnQuotation(t *testing.T) {
	h := newHarness(t)

	// The manager raises the deal themselves, so they hold the role the step
	// requires and are also the rep who stands to gain.
	manager := h.login(t, "manager@dealflow360.test")
	q := flaggedQuote(t, h, manager)

	managerStep := stepID(t, h, q.ID, 1, 1)
	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", manager, nil)

	if w.Code != http.StatusForbidden {
		t.Fatalf("self-approval = %d, want 403: %s", w.Code, w.Body)
	}
	if got := errorCode(t, w); got != "FORBIDDEN" {
		t.Errorf("code = %q, want FORBIDDEN", got)
	}
}

func TestRolesCannotCoverForEachOther(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	q := flaggedQuote(t, h, rep)
	managerStep := stepID(t, h, q.ID, 1, 1)

	// Finance holds a reviewing role, but not the one this step calls for.
	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", finance, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("finance taking the manager step = %d, want 403: %s", w.Code, w.Body)
	}

	// A rep cannot reach the inbox at all.
	if got := h.do(http.MethodGet, "/api/v1/approvals", rep, nil).Code; got != http.StatusForbidden {
		t.Errorf("rep reading the inbox = %d, want 403", got)
	}

	// The manager can.
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", manager, nil).Code; got != http.StatusOK {
		t.Errorf("manager taking their own step = %d, want 200", got)
	}
}

// An administrator can act at any step, so an absent approver never blocks a
// deal.
func TestAdminCanActAtAnyStep(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	admin := h.login(t, "admin@dealflow360.test")

	q := flaggedQuote(t, h, rep)

	for step := int32(1); step <= 2; step++ {
		id := stepID(t, h, q.ID, 1, step)
		w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(id)+"/approve", admin, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("admin approving step %d = %d: %s", step, w.Code, w.Body)
		}
		decodeJSON(t, w, &q)
	}
	if q.Status != "APPROVED" {
		t.Errorf("status = %s, want APPROVED", q.Status)
	}
}

func TestReasonIsMandatoryForReturnAndReject(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	for _, action := range []string{"return", "reject"} {
		t.Run(action, func(t *testing.T) {
			q := flaggedQuote(t, h, rep)
			id := stepID(t, h, q.ID, 1, 1)

			w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(id)+"/"+action, manager,
				map[string]string{"reason": ""})
			if w.Code != http.StatusUnprocessableEntity {
				t.Errorf("%s without a reason = %d, want 422: %s", action, w.Code, w.Body)
			}
		})
	}

	// Approving needs no note.
	q := flaggedQuote(t, h, rep)
	id := stepID(t, h, q.ID, 1, 1)
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(id)+"/approve", manager, nil).Code; got != http.StatusOK {
		t.Errorf("approve without a note = %d, want 200", got)
	}
}

func TestAStepCannotBeDecidedTwice(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	admin := h.login(t, "admin@dealflow360.test")

	q := flaggedQuote(t, h, rep)
	managerStep := stepID(t, h, q.ID, 1, 1)

	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", manager, nil).Code; got != http.StatusOK {
		t.Fatalf("first approval = %d, want 200", got)
	}

	// A second reviewer must not be able to overwrite the first's answer.
	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/reject", admin,
		map[string]string{"reason": "changed my mind"})
	if w.Code != http.StatusConflict {
		t.Errorf("re-deciding a closed step = %d, want 409: %s", w.Code, w.Body)
	}
}

// The inbox shows a reviewer only what they can act on.
func TestInboxIsScopedToTheReviewersRole(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	managerBefore := inboxCount(t, h, manager)
	financeBefore := inboxCount(t, h, finance)

	q := flaggedQuote(t, h, rep)

	// Both steps exist, but only the manager's is waiting on a manager.
	if got := inboxCount(t, h, manager); got != managerBefore+1 {
		t.Errorf("manager inbox = %d, want %d", got, managerBefore+1)
	}
	if got := inboxCount(t, h, finance); got != financeBefore+1 {
		t.Errorf("finance inbox = %d, want %d", got, financeBefore+1)
	}

	// After the manager signs, their step leaves the queue.
	managerStep := stepID(t, h, q.ID, 1, 1)
	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/approve", manager, nil).Code; got != http.StatusOK {
		t.Fatalf("approve = %d", got)
	}
	if got := inboxCount(t, h, manager); got != managerBefore {
		t.Errorf("manager inbox after approving = %d, want %d", got, managerBefore)
	}
}

// A step belonging to a returned quotation must not still be actionable.
func TestStepsOfAClosedQuotationAreNotActionable(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	q := flaggedQuote(t, h, rep)
	managerStep := stepID(t, h, q.ID, 1, 1)
	financeStep := stepID(t, h, q.ID, 1, 2)

	if got := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(managerStep)+"/return", manager,
		map[string]string{"reason": "needs work"}).Code; got != http.StatusOK {
		t.Fatalf("return = %d", got)
	}

	// The finance step was superseded along with the round.
	w := h.do(http.MethodPost, "/api/v1/approvals/"+itoa(financeStep)+"/approve", finance, nil)
	if w.Code != http.StatusConflict {
		t.Errorf("approving a superseded step = %d, want 409: %s", w.Code, w.Body)
	}
}

// The inbox carries the risk figures so a reviewer can triage without
// opening every deal.
func TestInboxRowsCarryTheRiskFigures(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q := flaggedQuote(t, h, rep)

	w := h.do(http.MethodGet, "/api/v1/approvals?limit=100", manager, nil)
	var page struct {
		Data []struct {
			QuotationID      int64  `json:"quotation_id"`
			Reference        string `json:"reference"`
			CustomerName     string `json:"customer_name"`
			CustomerTier     string `json:"customer_tier"`
			BlendedRiskScore string `json:"blended_risk_score"`
			MaxLineOverage   string `json:"max_line_overage"`
			RequiredLevel    string `json:"required_level"`
			GrandTotal       string `json:"grand_total"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)

	for _, row := range page.Data {
		if row.QuotationID != q.ID {
			continue
		}
		if row.BlendedRiskScore != "5.6" {
			t.Errorf("blended = %s, want 5.6", row.BlendedRiskScore)
		}
		if row.MaxLineOverage != "8" {
			t.Errorf("max overage = %s, want 8", row.MaxLineOverage)
		}
		if row.RequiredLevel != "MANAGER_FINANCE" {
			t.Errorf("level = %s, want MANAGER_FINANCE", row.RequiredLevel)
		}
		if row.CustomerName == "" || row.CustomerTier != "GOLD" || row.GrandTotal == "0" {
			t.Errorf("row is missing triage context: %+v", row)
		}
		return
	}
	t.Fatalf("quotation %d is not in the manager's inbox", q.ID)
}
