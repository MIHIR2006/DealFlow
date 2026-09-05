//go:build integration

package http_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"
)

type dealHealthBody struct {
	Summary struct {
		TotalQuotations  int64  `json:"total_quotations"`
		PipelineValue    string `json:"pipeline_value"`
		AwaitingApproval int64  `json:"awaiting_approval"`
		AvgMarginPct     string `json:"avg_margin_pct"`
	} `json:"summary"`
	Statuses []struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
	} `json:"statuses"`
	Stalled []struct {
		QuotationID  int64  `json:"quotation_id"`
		Reference    string `json:"reference"`
		CustomerName string `json:"customer_name"`
		RepName      string `json:"rep_name"`
		DaysInactive int32  `json:"days_inactive"`
	} `json:"stalled"`
	Anomalies []struct {
		QuotationID int64  `json:"quotation_id"`
		Reference   string `json:"reference"`
		RepName     string `json:"rep_name"`
		DiscountPct string `json:"discount_pct"`
		BaselinePct string `json:"baseline_pct"`
		Ratio       string `json:"ratio"`
	} `json:"discount_anomalies"`
	Slippage []struct {
		OrderID   int64  `json:"order_id"`
		Reference string `json:"reference"`
		DaysLate  int32  `json:"days_late"`
	} `json:"delivery_slippage"`
	Thresholds struct {
		StallDays         int32  `json:"stall_days"`
		AnomalyMultiplier string `json:"anomaly_multiplier"`
		AnomalyMinSample  int32  `json:"anomaly_min_sample"`
	} `json:"thresholds"`
}

func dealHealth(t *testing.T, h *harness, token, query string) dealHealthBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/dashboard/deal-health"+query, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("deal health = %d: %s", w.Code, w.Body)
	}
	var b dealHealthBody
	decodeJSON(t, w, &b)
	return b
}

// The dashboard must show real findings. A board full of placeholder rows is
// worse than an empty one, because nobody learns to trust it.
func TestDashboardFindsTheSeededTruePositives(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	board := dealHealth(t, h, manager, "")

	// A deal untouched for eleven days.
	if len(board.Stalled) == 0 {
		t.Fatal("no stalled deals found; the dashboard would be empty on stage")
	}
	var foundStalled bool
	for _, s := range board.Stalled {
		if s.Reference == "Q-9001" {
			foundStalled = true
			if s.DaysInactive < 7 {
				t.Errorf("Q-9001 reported at %d days, inside the 7-day window", s.DaysInactive)
			}
			if s.CustomerName == "" || s.RepName == "" {
				t.Errorf("stalled row lacks context to act on: %+v", s)
			}
		}
	}
	if !foundStalled {
		t.Errorf("the seeded stalled deal is missing: %+v", board.Stalled)
	}

	// A rep discounting far above their own baseline.
	if len(board.Anomalies) == 0 {
		t.Fatal("no discount anomalies found; the seeded outlier was not detected")
	}
	for _, a := range board.Anomalies {
		ratio, err := strconv.ParseFloat(a.Ratio, 64)
		if err != nil {
			t.Fatalf("ratio %q is not a number", a.Ratio)
		}
		if ratio <= 1 {
			t.Errorf("%s flagged at a ratio of %s, which is not an anomaly", a.Reference, a.Ratio)
		}
		if a.RepName == "" {
			t.Errorf("anomaly has no rep to talk to: %+v", a)
		}
	}

	// And the dashboard says what it looked for, not just what it found.
	if board.Thresholds.StallDays != 7 {
		t.Errorf("stall window = %d, want the configured 7", board.Thresholds.StallDays)
	}
	if board.Thresholds.AnomalyMultiplier != "1.5" {
		t.Errorf("multiplier = %s, want 1.5", board.Thresholds.AnomalyMultiplier)
	}
}

// The comparison is against the rep's own history. A rep who always discounts
// at 3% jumping to 12% is a signal even though 12% may break no policy.
func TestAnomalyIsMeasuredAgainstTheRepsOwnBaseline(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	board := dealHealth(t, h, manager, "")

	for _, a := range board.Anomalies {
		discount, err := strconv.ParseFloat(a.DiscountPct, 64)
		if err != nil {
			t.Fatalf("discount %q is not a number", a.DiscountPct)
		}
		baseline, err := strconv.ParseFloat(a.BaselinePct, 64)
		if err != nil {
			t.Fatalf("baseline %q is not a number", a.BaselinePct)
		}
		if discount <= baseline*1.5 {
			t.Errorf("%s: %.2f%% against a %.2f%% baseline does not clear the 1.5x threshold",
				a.Reference, discount, baseline)
		}
	}
}

// Widening the window must surface more, narrowing it less. If the threshold
// did nothing, the dashboard would be decorative.
func TestStallWindowIsHonoured(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	wide := dealHealth(t, h, manager, "?stall_days=1")
	narrow := dealHealth(t, h, manager, "?stall_days=365")

	if len(wide.Stalled) <= len(narrow.Stalled) {
		t.Errorf("a 1-day window found %d and a 365-day window %d; the threshold is not applied",
			len(wide.Stalled), len(narrow.Stalled))
	}
	if len(narrow.Stalled) != 0 {
		t.Errorf("a 365-day window still found %d stalled deals", len(narrow.Stalled))
	}
	if wide.Thresholds.StallDays != 1 {
		t.Errorf("thresholds echo %d, want the requested 1", wide.Thresholds.StallDays)
	}
}

func TestNonsenseThresholdsAreRefused(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	// A multiplier of one or below makes every deal an anomaly.
	for _, q := range []string{"?multiplier=1", "?multiplier=0.5", "?stall_days=0"} {
		w := h.do(http.MethodGet, "/api/v1/dashboard/deal-health"+q, manager, nil)
		if w.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s = %d, want 422: %s", q, w.Code, w.Body)
		}
	}
}

// An order past its promised date, not yet fully shipped.
func TestDeliverySlippageIsDetected(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "1"})

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/confirm", rep,
		map[string]string{"promised_date": time.Now().AddDate(0, 0, -5).Format("2006-01-02")})
	if w.Code != http.StatusCreated {
		t.Fatalf("confirm = %d: %s", w.Code, w.Body)
	}
	var o orderBody
	decodeJSON(t, w, &o)

	board := dealHealth(t, h, manager, "")

	var found bool
	for _, s := range board.Slippage {
		if s.OrderID == o.ID {
			found = true
			if s.DaysLate < 4 {
				t.Errorf("days late = %d, want about 5", s.DaysLate)
			}
		}
	}
	if !found {
		t.Errorf("the overdue order is not flagged: %+v", board.Slippage)
	}
}

// Nudging records the chase and takes the deal off the stalled list.
func TestNudgeClearsTheStalledFlag(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	var stalledID int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM quotations WHERE reference = 'Q-9001'`).Scan(&stalledID); err != nil {
		t.Fatalf("find the seeded stalled deal: %v", err)
	}

	before := dealHealth(t, h, manager, "")
	if len(before.Stalled) == 0 {
		t.Fatal("nothing is stalled to begin with")
	}

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(stalledID)+"/nudge", manager,
		map[string]string{"note": "Called the buyer, revised terms coming"})
	if w.Code != http.StatusOK {
		t.Fatalf("nudge = %d: %s", w.Code, w.Body)
	}

	after := dealHealth(t, h, manager, "")
	for _, s := range after.Stalled {
		if s.QuotationID == stalledID {
			t.Errorf("the deal is still stalled after a nudge: %+v", s)
		}
	}

	// The alert it came from is closed, and the chase is on the record.
	var openAlerts int
	if err := h.pool.QueryRow(t.Context(),
		`SELECT count(*) FROM deal_alerts
		  WHERE quotation_id = $1 AND alert_type = 'STALLED' AND resolved_at IS NULL`,
		stalledID).Scan(&openAlerts); err != nil {
		t.Fatalf("read alerts: %v", err)
	}
	if openAlerts != 0 {
		t.Errorf("%d stalled alerts are still open", openAlerts)
	}

	w = h.do(http.MethodGet, "/api/v1/quotations/"+itoa(stalledID), rep, nil)
	var q quoteBody
	decodeJSON(t, w, &q)

	var nudged bool
	for _, a := range q.Audit {
		if a.Action == "NUDGED" {
			nudged = true
			if a.Note != "Called the buyer, revised terms coming" {
				t.Errorf("note = %q, want the manager's own words", a.Note)
			}
		}
	}
	if !nudged {
		t.Error("the nudge is not in the audit trail")
	}
}

func TestOpenAlertsAreListed(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	w := h.do(http.MethodGet, "/api/v1/dashboard/alerts", manager, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("alerts = %d: %s", w.Code, w.Body)
	}

	var page struct {
		Data []struct {
			AlertType    string `json:"alert_type"`
			Severity     string `json:"severity"`
			Detail       string `json:"detail"`
			Reference    string `json:"reference"`
			CustomerName string `json:"customer_name"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)

	if len(page.Data) == 0 {
		t.Fatal("no seeded alerts returned")
	}
	for _, a := range page.Data {
		if a.Detail == "" || a.Reference == "" || a.CustomerName == "" {
			t.Errorf("alert lacks the context to act on it: %+v", a)
		}
	}
}

// A rep must not see the whole company's pipeline.
func TestDashboardIsRestrictedToReviewers(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	for _, path := range []string{"/api/v1/dashboard/deal-health", "/api/v1/dashboard/alerts"} {
		if got := h.do(http.MethodGet, path, rep, nil).Code; got != http.StatusForbidden {
			t.Errorf("rep on %s = %d, want 403", path, got)
		}
	}
	if got := h.do(http.MethodPost, "/api/v1/quotations/1/nudge", rep, nil).Code; got != http.StatusForbidden {
		t.Errorf("rep nudging = %d, want 403", got)
	}
}

// The four filters the problem statement names.
func TestReportSupportsTheFourFilters(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	setup := productBySKUOverHTTP(t, h, "SV-SETUP")

	q := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, q.ID, laptop.ID, "2", "5")
	addLine(t, h, rep, q.ID, setup.ID, "1", "5")

	type report struct {
		Rows []struct {
			RepName      string `json:"rep_name"`
			SalesTeam    string `json:"sales_team"`
			CategoryName string `json:"category_name"`
			NetRevenue   string `json:"net_revenue"`
			Margin       string `json:"margin"`
		} `json:"rows"`
		Summary struct {
			TotalQuotations int64 `json:"total_quotations"`
		} `json:"summary"`
		AppliedFilter struct {
			SalesTeam string `json:"sales_team"`
			Status    string `json:"status"`
		} `json:"applied_filter"`
	}

	get := func(token, query string) report {
		w := h.do(http.MethodGet, "/api/v1/reports"+query, token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("report%s = %d: %s", query, w.Code, w.Body)
		}
		var r report
		decodeJSON(t, w, &r)
		return r
	}

	all := get(finance, "")
	if len(all.Rows) == 0 {
		t.Fatal("the unfiltered report is empty")
	}

	// Period.
	future := get(finance, "?from="+time.Now().AddDate(1, 0, 0).Format("2006-01-02"))
	if len(future.Rows) != 0 {
		t.Errorf("a report for next year returned %d rows", len(future.Rows))
	}

	// Category.
	hardwareOnly := get(finance, "?category_id="+itoa(laptop.CategoryID))
	for _, r := range hardwareOnly.Rows {
		if r.CategoryName != "Hardware" {
			t.Errorf("category filter returned %q", r.CategoryName)
		}
	}
	if len(hardwareOnly.Rows) == 0 {
		t.Error("the category filter returned nothing")
	}

	// Approval status.
	drafts := get(finance, "?status=DRAFT")
	for _, r := range drafts.Rows {
		if r.NetRevenue == "" {
			t.Errorf("status filter returned a row with no revenue: %+v", r)
		}
	}

	// Rep.
	byRep := get(finance, "?rep_id="+itoa(4))
	for _, r := range byRep.Rows {
		if r.RepName != "J. Rao" {
			t.Errorf("rep filter returned %q", r.RepName)
		}
	}
}

// A manager reports on their own team whatever they ask for, and a rep on
// their own numbers. The response says which filter was actually applied,
// rather than silently narrowing.
func TestReportScopeIsNarrowedByRoleAndEchoedBack(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	other := h.login(t, "rep2@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	mine := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, mine.ID, laptop.ID, "2", "5")

	theirs := newQuote(t, h, other, "Beta Industries")
	addLine(t, h, other, theirs.ID, laptop.ID, "3", "5")

	var repReport struct {
		Rows []struct {
			RepName string `json:"rep_name"`
		} `json:"rows"`
		AppliedFilter struct {
			RepID     *int64 `json:"rep_id"`
			SalesTeam string `json:"sales_team"`
		} `json:"applied_filter"`
	}

	// A rep asking for the whole company still gets only themselves.
	w := h.do(http.MethodGet, "/api/v1/reports?sales_team=west", rep, nil)
	decodeJSON(t, w, &repReport)

	for _, r := range repReport.Rows {
		if r.RepName != "J. Rao" {
			t.Errorf("a rep's report includes %q", r.RepName)
		}
	}
	if repReport.AppliedFilter.RepID == nil {
		t.Error("the applied filter does not say the report was narrowed to one rep")
	}

	// A manager asking for another team still gets their own.
	var managerReport struct {
		AppliedFilter struct {
			SalesTeam string `json:"sales_team"`
		} `json:"applied_filter"`
	}
	w = h.do(http.MethodGet, "/api/v1/reports?sales_team=east", manager, nil)
	decodeJSON(t, w, &managerReport)

	if managerReport.AppliedFilter.SalesTeam != "west" {
		t.Errorf("applied team = %q, want the manager's own west", managerReport.AppliedFilter.SalesTeam)
	}
}

// The dashboard is a fixed number of aggregate queries, so it costs the same
// at twenty quotations as at twenty thousand.
func TestDashboardStaysWithinItsQueryBudget(t *testing.T) {
	h := newHarness(t)
	manager := h.login(t, "manager@dealflow360.test")

	w := h.do(http.MethodGet, "/api/v1/dashboard/deal-health", manager, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	raw := w.Header().Get("X-DB-Queries")
	got, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("X-DB-Queries = %q, not a number", raw)
	}
	if got > 6 {
		t.Errorf("deal health took %d queries, budget is 6", got)
	}
	t.Logf("deal health: %s queries, %s ms", raw, w.Header().Get("X-DB-Time-Ms"))
}

func TestDashboardCostDoesNotGrowWithData(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	manager := h.login(t, "manager@dealflow360.test")

	queries := func() int {
		w := h.do(http.MethodGet, "/api/v1/dashboard/deal-health", manager, nil)
		n, err := strconv.Atoi(w.Header().Get("X-DB-Queries"))
		if err != nil {
			t.Fatalf("X-DB-Queries: %v", err)
		}
		return n
	}

	before := queries()

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	for i := 0; i < 10; i++ {
		q := newQuote(t, h, rep, "Acme Corporation")
		addLine(t, h, rep, q.ID, laptop.ID, "1", "5")
	}

	if after := queries(); after != before {
		t.Errorf("dashboard cost moved from %d to %d queries after adding ten deals; "+
			"something is querying per row", before, after)
	}
}
