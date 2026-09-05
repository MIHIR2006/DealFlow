//go:build integration

package http_test

import (
	"net/http"
	"strconv"
	"testing"
)

// quoteBody mirrors the builder payload the frontend consumes.
type quoteBody struct {
	ID               int64  `json:"id"`
	Reference        string `json:"reference"`
	Status           string `json:"status"`
	Version          int32  `json:"version"`
	CustomerTier     string `json:"customer_tier"`
	OrderDiscountPct string `json:"order_discount_pct"`

	Lines []struct {
		ID                   int64  `json:"id"`
		ProductName          string `json:"product_name"`
		Qty                  string `json:"qty"`
		LineDiscountPct      string `json:"line_discount_pct"`
		EffectiveDiscountPct string `json:"effective_discount_pct"`
		ListValue            string `json:"list_value"`
		NetAmount            string `json:"net_amount"`
		MarginPct            string `json:"margin_pct"`
		LineType             string `json:"line_type"`
	} `json:"lines"`

	Totals struct {
		ListSubtotal   string `json:"list_subtotal"`
		DiscountTotal  string `json:"discount_total"`
		NetSubtotal    string `json:"net_subtotal"`
		GrandTotal     string `json:"grand_total"`
		MarginPct      string `json:"margin_pct"`
		OneTimeTotal   string `json:"one_time_total"`
		RecurringTotal string `json:"recurring_total"`
	} `json:"totals"`

	Risk struct {
		BlendedScore   string `json:"blended_score"`
		MaxLineOverage string `json:"max_line_overage"`
		RequiredLevel  string `json:"required_level"`
		Rationale      string `json:"rationale"`
		ConfigVersion  int64  `json:"config_version"`
		Breakdown      []struct {
			ProductName string `json:"product_name"`
			GivenPct    string `json:"given_pct"`
			AllowedPct  string `json:"allowed_pct"`
			OveragePts  string `json:"overage_pts"`
			IsOver      bool   `json:"is_over"`
		} `json:"breakdown"`
	} `json:"risk"`

	Approvals []struct {
		Round        int32  `json:"round"`
		Step         int32  `json:"step"`
		RequiredRole string `json:"required_role"`
		Status       string `json:"status"`
	} `json:"approvals"`

	Audit []struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	} `json:"audit"`
}

// customerID looks up a seeded customer by name.
func customerID(t *testing.T, h *harness, name string) int64 {
	t.Helper()

	var id int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM customers WHERE name = $1`, name).Scan(&id); err != nil {
		t.Fatalf("find customer %q: %v", name, err)
	}
	return id
}

// newQuote opens a draft for a customer as the given account.
func newQuote(t *testing.T, h *harness, token string, customer string) quoteBody {
	t.Helper()

	w := h.do(http.MethodPost, "/api/v1/quotations", token,
		map[string]any{"customer_id": customerID(t, h, customer)})
	if w.Code != http.StatusCreated {
		t.Fatalf("create quotation = %d: %s", w.Code, w.Body)
	}

	var q quoteBody
	decodeJSON(t, w, &q)
	return q
}

func addLine(t *testing.T, h *harness, token string, quoteID, productID int64, qty, discount string) quoteBody {
	t.Helper()

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(quoteID)+"/lines", token,
		map[string]any{"product_id": productID, "qty": qty, "discount_pct": discount})
	if w.Code != http.StatusOK {
		t.Fatalf("add line = %d: %s", w.Code, w.Body)
	}

	var q quoteBody
	decodeJSON(t, w, &q)
	return q
}

// The worked example from the problem statement, driven end to end over HTTP:
// a Gold customer, one compliant hardware line and one service line 8 points
// past its stricter ceiling, blending to 5.6 and routing to finance.
func TestBuilderReproducesTheSpecWorkedExample(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	if q.CustomerTier != "GOLD" {
		t.Fatalf("customer tier = %s, want GOLD", q.CustomerTier)
	}

	// 1 x 45,000 hardware at 12%: inside both its tier and category ceilings.
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "12")
	if q.Risk.RequiredLevel != "NONE" {
		t.Errorf("after a compliant line RequiredLevel = %s, want NONE", q.Risk.RequiredLevel)
	}
	if !q.Risk.Breakdown[0].IsOver == false {
		t.Errorf("the hardware line was flagged: %+v", q.Risk.Breakdown[0])
	}

	// 7 x 15,000 services at 18% against a 10% ceiling: 8 points over.
	q = addLine(t, h, rep, q.ID, setup.ID, "7", "18")

	if q.Risk.BlendedScore != "5.6" {
		t.Errorf("BlendedScore = %s, want 5.6", q.Risk.BlendedScore)
	}
	if q.Risk.MaxLineOverage != "8" {
		t.Errorf("MaxLineOverage = %s, want 8", q.Risk.MaxLineOverage)
	}
	if q.Risk.RequiredLevel != "MANAGER_FINANCE" {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE", q.Risk.RequiredLevel)
	}
	if q.Risk.ConfigVersion == 0 {
		t.Error("config_version is 0; the verdict cannot be explained later")
	}

	// The breakdown is the "Why This Quote Was Flagged" table, and it comes
	// from the same engine call as the score above it.
	if len(q.Risk.Breakdown) != 2 {
		t.Fatalf("breakdown has %d rows, want one per line", len(q.Risk.Breakdown))
	}
	svc := q.Risk.Breakdown[1]
	if svc.GivenPct != "18" || svc.AllowedPct != "10" || svc.OveragePts != "8" || !svc.IsOver {
		t.Errorf("service row = %+v, want 18 given / 10 allowed / 8 over / flagged", svc)
	}
	if hw := q.Risk.Breakdown[0]; hw.OveragePts != "0" || hw.IsOver {
		t.Errorf("hardware row = %+v, want 0 over and not flagged", hw)
	}
	if q.Risk.Rationale == "" {
		t.Error("rationale is empty; the approval screen has nothing to show")
	}
}

// Submitting must route on its own. The rep neither asks for approval nor
// picks an approver.
func TestSubmitRoutesItselfWithoutTheRepAsking(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "12")
	q = addLine(t, h, rep, q.ID, setup.ID, "7", "18")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Status != "PENDING_APPROVAL" {
		t.Errorf("status = %s, want PENDING_APPROVAL", q.Status)
	}
	if len(q.Approvals) != 2 {
		t.Fatalf("chain has %d steps, want 2: %+v", len(q.Approvals), q.Approvals)
	}
	if q.Approvals[0].RequiredRole != "MANAGER" || q.Approvals[0].Step != 1 {
		t.Errorf("step 1 = %+v, want MANAGER at step 1", q.Approvals[0])
	}
	if q.Approvals[1].RequiredRole != "FINANCE" || q.Approvals[1].Step != 2 {
		t.Errorf("step 2 = %+v, want FINANCE at step 2", q.Approvals[1])
	}
	for _, a := range q.Approvals {
		if a.Status != "PENDING" {
			t.Errorf("step %d status = %s, want PENDING", a.Step, a.Status)
		}
	}
}

func TestCompliantQuotationSkipsApprovalEntirely(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "2", "10")

	if q.Risk.RequiredLevel != "NONE" {
		t.Fatalf("RequiredLevel = %s, want NONE", q.Risk.RequiredLevel)
	}

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Status != "APPROVED" {
		t.Errorf("status = %s, want APPROVED for a compliant quotation", q.Status)
	}
	if len(q.Approvals) != 0 {
		t.Errorf("chain has %d steps, want none: %+v", len(q.Approvals), q.Approvals)
	}
}

// A rep setting 0% on every line and 20% on the order must not slip through.
func TestOrderDiscountIsScoredNotHidden(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "2", "0")

	if q.Risk.RequiredLevel != "NONE" {
		t.Fatalf("a 0%% line already needs approval: %s", q.Risk.RequiredLevel)
	}

	w := h.do(http.MethodPut, "/api/v1/quotations/"+itoa(q.ID)+"/order-discount", rep,
		map[string]string{"order_discount_pct": "20"})
	if w.Code != http.StatusOK {
		t.Fatalf("set order discount = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Lines[0].LineDiscountPct != "0" {
		t.Errorf("line discount = %s, want it left at 0", q.Lines[0].LineDiscountPct)
	}
	if q.Lines[0].EffectiveDiscountPct != "20" {
		t.Errorf("effective discount = %s, want 20", q.Lines[0].EffectiveDiscountPct)
	}
	// Gold allows 15, so 20 effective is 5 points over and needs a manager.
	if q.Risk.MaxLineOverage != "5" {
		t.Errorf("MaxLineOverage = %s, want 5", q.Risk.MaxLineOverage)
	}
	if q.Risk.RequiredLevel == "NONE" {
		t.Error("a 20% order discount was waved through; it must be scored")
	}
}

func TestLineAndOrderDiscountsComposeMultiplicatively(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "10")

	w := h.do(http.MethodPut, "/api/v1/quotations/"+itoa(q.ID)+"/order-discount", rep,
		map[string]string{"order_discount_pct": "10"})
	decodeJSON(t, w, &q)

	// 10% then 10% is 19%, not 20%: the second applies to the discounted price.
	if q.Lines[0].EffectiveDiscountPct != "19" {
		t.Errorf("effective discount = %s, want 19", q.Lines[0].EffectiveDiscountPct)
	}
}

// Totals must be the sum of the lines shown beside them.
func TestTotalsAgreeWithTheLines(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "2", "10")
	q = addLine(t, h, rep, q.ID, docking.ID, "3", "5")

	// 2 x 45000 = 90000, 3 x 8000 = 24000.
	if q.Totals.ListSubtotal != "114000" {
		t.Errorf("ListSubtotal = %s, want 114000", q.Totals.ListSubtotal)
	}
	// 10% of 90000 plus 5% of 24000.
	if q.Totals.DiscountTotal != "10200" {
		t.Errorf("DiscountTotal = %s, want 10200", q.Totals.DiscountTotal)
	}
	if q.Totals.NetSubtotal != "103800" {
		t.Errorf("NetSubtotal = %s, want 103800", q.Totals.NetSubtotal)
	}
}

func TestOneTimeAndRecurringAreTrackedSeparately(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	support := productBySKUOverHTTP(t, h, "SB-SUPPORT")

	var planID int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM subscription_plans WHERE period = 'MONTHLY' LIMIT 1`).Scan(&planID); err != nil {
		t.Fatalf("find plan: %v", err)
	}

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "0")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep, map[string]any{
		"product_id": support.ID, "qty": "3", "discount_pct": "0", "plan_id": planID,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("add subscription line = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Totals.OneTimeTotal != "45000" {
		t.Errorf("OneTimeTotal = %s, want 45000", q.Totals.OneTimeTotal)
	}
	if q.Totals.RecurringTotal != "15000" {
		t.Errorf("RecurringTotal = %s, want 15000", q.Totals.RecurringTotal)
	}
	if q.Lines[1].LineType != "RECURRING" {
		t.Errorf("subscription line type = %s, want RECURRING", q.Lines[1].LineType)
	}
}

func TestSubscriptionLineRequiresAPlan(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	support := productBySKUOverHTTP(t, h, "SB-SUPPORT")
	q := newQuote(t, h, rep, "Acme Corporation")

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep, map[string]any{
		"product_id": support.ID, "qty": "3", "discount_pct": "0",
	})
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("subscription line without a plan = %d, want 422: %s", w.Code, w.Body)
	}
}

func TestLineUpdateAndDeleteRecalculate(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	q = addLine(t, h, rep, q.ID, laptop.ID, "1", "0")
	lineID := q.Lines[0].ID

	// Raising the discount past the Gold ceiling must move the verdict.
	w := h.do(http.MethodPatch,
		"/api/v1/quotations/"+itoa(q.ID)+"/lines/"+itoa(lineID), rep,
		map[string]string{"qty": "2", "discount_pct": "25"})
	if w.Code != http.StatusOK {
		t.Fatalf("update line = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if q.Lines[0].Qty != "2" {
		t.Errorf("qty = %s, want 2", q.Lines[0].Qty)
	}
	if q.Risk.MaxLineOverage != "10" {
		t.Errorf("MaxLineOverage = %s, want 10", q.Risk.MaxLineOverage)
	}
	if q.Risk.RequiredLevel != "MANAGER_FINANCE" {
		t.Errorf("RequiredLevel = %s, want MANAGER_FINANCE", q.Risk.RequiredLevel)
	}

	// Removing the line clears the verdict with it.
	w = h.do(http.MethodDelete,
		"/api/v1/quotations/"+itoa(q.ID)+"/lines/"+itoa(lineID), rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete line = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &q)

	if len(q.Lines) != 0 {
		t.Errorf("lines remain after delete: %+v", q.Lines)
	}
	if q.Risk.RequiredLevel != "NONE" || q.Totals.GrandTotal != "0" {
		t.Errorf("emptied quotation still reads level=%s total=%s",
			q.Risk.RequiredLevel, q.Totals.GrandTotal)
	}
}

// A quotation awaiting approval must not be editable, or a rep could have
// terms signed off and then change them.
func TestSubmittedQuotationCannotBeEdited(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "12")
	q = addLine(t, h, rep, q.ID, setup.ID, "7", "18")

	if w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil); w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep,
		map[string]any{"product_id": laptop.ID, "qty": "1", "discount_pct": "0"})
	if w.Code != http.StatusConflict {
		t.Errorf("editing a pending quotation = %d, want 409: %s", w.Code, w.Body)
	}
}

func TestEmptyQuotationCannotBeSubmitted(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q := newQuote(t, h, rep, "Acme Corporation")
	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("submitting an empty quotation = %d, want 422: %s", w.Code, w.Body)
	}
}

// A rep sees only their own deals; a manager their team's; finance all.
// A quotation outside the caller's scope reads as absent rather than
// forbidden, so the shape of the pipeline is not leaked.
func TestVisibilityIsScopedByRole(t *testing.T) {
	h := newHarness(t)

	rep := h.login(t, "rep@dealflow360.test")
	other := h.login(t, "rep2@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	q := newQuote(t, h, rep, "Acme Corporation")
	path := "/api/v1/quotations/" + itoa(q.ID)

	if got := h.do(http.MethodGet, path, rep, nil).Code; got != http.StatusOK {
		t.Errorf("owner = %d, want 200", got)
	}
	if got := h.do(http.MethodGet, path, other, nil).Code; got != http.StatusNotFound {
		t.Errorf("another rep = %d, want 404", got)
	}
	if got := h.do(http.MethodGet, path, finance, nil).Code; got != http.StatusOK {
		t.Errorf("finance = %d, want 200", got)
	}
	// Both reps and the manager are on the west team.
	if got := h.do(http.MethodGet, path, manager, nil).Code; got != http.StatusOK {
		t.Errorf("same-team manager = %d, want 200", got)
	}

	// The listing is scoped too.
	w := h.do(http.MethodGet, "/api/v1/quotations?limit=100", other, nil)
	var page struct {
		Data []struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)
	for _, row := range page.Data {
		if row.ID == q.ID {
			t.Fatalf("another rep's listing included quotation %d", q.ID)
		}
	}
}

// A line id belonging to a different quotation must not be reachable.
func TestLineCannotBeEditedThroughAnotherQuotation(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	a := newQuote(t, h, rep, "Acme Corporation")
	a = addLine(t, h, rep, a.ID, laptop.ID, "1", "0")

	b := newQuote(t, h, rep, "Beta Industries")

	w := h.do(http.MethodPatch,
		"/api/v1/quotations/"+itoa(b.ID)+"/lines/"+itoa(a.Lines[0].ID), rep,
		map[string]string{"qty": "9", "discount_pct": "50"})
	if w.Code != http.StatusNotFound {
		t.Errorf("cross-quotation line edit = %d, want 404: %s", w.Code, w.Body)
	}
}

// The detail view is one request and must stay within its query budget, or
// the builder slows down as deals grow.
func TestQuotationDetailStaysWithinItsQueryBudget(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	monitor := productBySKUOverHTTP(t, h, "HW-MON27")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	for _, p := range []int64{laptop.ID, docking.ID, monitor.ID, setup.ID} {
		addLine(t, h, rep, q.ID, p, "2", "5")
	}

	w := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID), rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	raw := w.Header().Get("X-DB-Queries")
	got, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("X-DB-Queries = %q, not a number", raw)
	}
	// Header, lines, approvals, trail. Four lines must cost the same as one.
	if got > 5 {
		t.Errorf("detail took %d queries for a 4-line quotation, budget is 5", got)
	}
	t.Logf("quotation detail: %s queries, %s ms", raw, w.Header().Get("X-DB-Time-Ms"))
}

// Recalculation writes every line in one statement, so the cost of editing
// must not grow with the number of lines.
func TestRecalculationCostDoesNotGrowWithLineCount(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	products := []int64{
		productBySKUOverHTTP(t, h, "HW-LAPTOP").ID,
		productBySKUOverHTTP(t, h, "HW-DOCK").ID,
		productBySKUOverHTTP(t, h, "HW-MON27").ID,
		productBySKUOverHTTP(t, h, "SV-SETUP").ID,
		productBySKUOverHTTP(t, h, "SV-TRAIN").ID,
	}

	q := newQuote(t, h, rep, "Acme Corporation")

	var first, last int
	for i, p := range products {
		w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep,
			map[string]any{"product_id": p, "qty": "1", "discount_pct": "5"})
		if w.Code != http.StatusOK {
			t.Fatalf("add line %d = %d: %s", i, w.Code, w.Body)
		}

		n, err := strconv.Atoi(w.Header().Get("X-DB-Queries"))
		if err != nil {
			t.Fatalf("X-DB-Queries: %v", err)
		}
		if i == 0 {
			first = n
		}
		last = n
		t.Logf("line %d: %d queries", i+1, n)
	}

	if last > first {
		t.Errorf("adding the 5th line cost %d queries versus %d for the 1st; "+
			"the write is not batched", last, first)
	}
}

func TestAuditTrailRecordsCreationAndSubmission(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "1", "25")

	if w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil); w.Code != http.StatusOK {
		t.Fatalf("submit = %d: %s", w.Code, w.Body)
	}

	w := h.do(http.MethodGet, "/api/v1/quotations/"+itoa(q.ID), rep, nil)
	decodeJSON(t, w, &q)

	actions := map[string]string{}
	for _, a := range q.Audit {
		actions[a.Action] = a.Note
	}
	if _, ok := actions["CREATED"]; !ok {
		t.Error("no CREATED entry in the trail")
	}
	note, ok := actions["SUBMITTED"]
	if !ok {
		t.Fatal("no SUBMITTED entry in the trail")
	}
	// The trail has to say why it routed where it did.
	if note == "" {
		t.Error("the SUBMITTED entry has no note explaining the routing")
	}
}
