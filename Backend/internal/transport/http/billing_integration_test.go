//go:build integration

package http_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

type billingBody struct {
	OrderID  int64 `json:"order_id"`
	Invoices []struct {
		ID          int64  `json:"id"`
		Reference   string `json:"reference"`
		Kind        string `json:"kind"`
		Status      string `json:"status"`
		Total       string `json:"total"`
		AmountPaid  string `json:"amount_paid"`
		Outstanding string `json:"outstanding"`
	} `json:"invoices"`
	Schedule []struct {
		ID          int64  `json:"id"`
		Seq         int32  `json:"seq"`
		ProductName string `json:"product_name"`
		PeriodStart string `json:"period_start"`
		PeriodEnd   string `json:"period_end"`
		Amount      string `json:"amount"`
		Status      string `json:"status"`
	} `json:"schedules"`
	CreditNotes []struct {
		Reference string `json:"reference"`
		Amount    string `json:"amount"`
		Reason    string `json:"reason"`
	} `json:"credit_notes"`
	OneTimeTotal   string `json:"one_time_total"`
	RecurringTotal string `json:"recurring_total_per_period"`
}

// hybridOrder builds the shape the spec cares about: one order carrying both
// a one-time hardware line and a monthly subscription, confirmed and ready to
// bill.
func hybridOrder(t *testing.T, h *harness, rep string) (quoteBody, orderBody, int64) {
	t.Helper()

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

	var subLineID int64
	for _, l := range q.Lines {
		if l.LineType == "RECURRING" {
			subLineID = l.ID
		}
	}

	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil).Code; got != http.StatusOK {
		t.Fatalf("submit = %d", got)
	}
	o := confirmOrder(t, h, rep, q.ID)
	return q, o, subLineID
}

func generateBilling(t *testing.T, h *harness, token string, orderID int64) billingBody {
	t.Helper()

	req := h.request(http.MethodPost, "/api/v1/orders/"+itoa(orderID)+"/invoices", token, nil)
	req.Header.Set("Idempotency-Key", fmt.Sprintf("generate-billing-%d", orderID))
	w := h.send(req)
	if w.Code != http.StatusCreated {
		t.Fatalf("generate billing = %d: %s", w.Code, w.Body)
	}

	var b billingBody
	decodeJSON(t, w, &b)
	return b
}

// The hybrid billing requirement: one order, two tracks, billed separately.
func TestOneOrderProducesAnInvoiceAndARecurringSchedule(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)

	// Exactly one invoice, covering only the one-time line.
	if len(b.Invoices) != 1 {
		t.Fatalf("invoices = %d, want 1: %+v", len(b.Invoices), b.Invoices)
	}
	inv := b.Invoices[0]
	if inv.Kind != "ONETIME" {
		t.Errorf("invoice kind = %s, want ONETIME", inv.Kind)
	}
	if inv.Status != "POSTED" {
		t.Errorf("invoice status = %s, want POSTED", inv.Status)
	}
	// 45,000 laptop plus 18% tax; the subscription is not on this bill.
	if inv.Total != "53100" {
		t.Errorf("invoice total = %s, want 53100 (hardware only, with tax)", inv.Total)
	}

	// The subscription becomes a schedule of twelve monthly periods.
	if len(b.Schedule) != 12 {
		t.Fatalf("schedule rows = %d, want 12", len(b.Schedule))
	}
	for i, row := range b.Schedule {
		if row.Amount != "15000" {
			t.Errorf("period %d amount = %s, want 15000", i+1, row.Amount)
		}
		if row.Status != "SCHEDULED" {
			t.Errorf("period %d status = %s, want SCHEDULED", i+1, row.Status)
		}
	}

	// Periods are contiguous: no gaps, no overlaps.
	for i := 0; i < len(b.Schedule)-1; i++ {
		if b.Schedule[i].PeriodEnd != b.Schedule[i+1].PeriodStart {
			t.Errorf("period %d ends %s but %d starts %s",
				i+1, b.Schedule[i].PeriodEnd, i+2, b.Schedule[i+1].PeriodStart)
		}
	}

	// The headline figures a customer actually asks about.
	if b.OneTimeTotal != "53100" {
		t.Errorf("one-time total = %s, want 53100", b.OneTimeTotal)
	}
	if b.RecurringTotal != "15000" {
		t.Errorf("recurring per period = %s, want 15000 (one period, not twelve)", b.RecurringTotal)
	}
}

func TestSubscriptionOnlyOrderHasNoImmediateInvoice(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	support := productBySKUOverHTTP(t, h, "SB-SUPPORT")
	var planID int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM subscription_plans WHERE period = 'MONTHLY' LIMIT 1`).Scan(&planID); err != nil {
		t.Fatalf("find plan: %v", err)
	}

	q := newQuote(t, h, rep, "Acme Corporation")
	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep, map[string]any{
		"product_id": support.ID, "qty": "2", "discount_pct": "0", "plan_id": planID,
	}).Code; got != http.StatusOK {
		t.Fatalf("add line = %d", got)
	}
	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil).Code; got != http.StatusOK {
		t.Fatalf("submit = %d", got)
	}

	o := confirmOrder(t, h, rep, q.ID)
	b := generateBilling(t, h, rep, o.ID)

	// Nothing is due today; the schedule is the whole story.
	if len(b.Invoices) != 0 {
		t.Errorf("invoices = %+v, want none for a subscription-only order", b.Invoices)
	}
	if len(b.Schedule) == 0 {
		t.Error("no schedule generated")
	}
}

func TestPartialPaymentDoesNotSettleTheInvoice(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)
	invoiceID := b.Invoices[0].ID

	w := h.do(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "20000", "method": "BANK"})
	if w.Code != http.StatusOK {
		t.Fatalf("partial payment = %d: %s", w.Code, w.Body)
	}

	var inv struct {
		Status      string `json:"status"`
		AmountPaid  string `json:"amount_paid"`
		Outstanding string `json:"outstanding"`
	}
	decodeJSON(t, w, &inv)

	if inv.Status != "PARTIAL" {
		t.Errorf("status = %s, want PARTIAL", inv.Status)
	}
	if inv.AmountPaid != "20000" {
		t.Errorf("amount paid = %s, want 20000", inv.AmountPaid)
	}
	if inv.Outstanding != "33100" {
		t.Errorf("outstanding = %s, want 33100", inv.Outstanding)
	}

	// Settling the rest completes it, and the order follows.
	w = h.do(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "33100", "method": "CASH"})
	if w.Code != http.StatusOK {
		t.Fatalf("final payment = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &inv)

	if inv.Status != "PAID" {
		t.Errorf("status = %s, want PAID", inv.Status)
	}

	var orderStatus string
	if err := h.pool.QueryRow(t.Context(),
		`SELECT status FROM sales_orders WHERE id = $1`, o.ID).Scan(&orderStatus); err != nil {
		t.Fatalf("read order: %v", err)
	}
	if orderStatus != "PAID" {
		t.Errorf("order status = %s, want PAID", orderStatus)
	}
}

func TestOverpaymentIsRefused(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)

	w := h.do(http.MethodPost, "/api/v1/invoices/"+itoa(b.Invoices[0].ID)+"/payments", rep,
		map[string]string{"amount": "99999999", "method": "BANK"})
	if w.Code != http.StatusConflict {
		t.Errorf("overpayment = %d, want 409: %s", w.Code, w.Body)
	}
}

// A client that times out cannot tell whether its payment landed. With a key,
// retrying is always the right move.
func TestRepeatedPaymentWithTheSameKeyChargesOnce(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)
	invoiceID := b.Invoices[0].ID

	body := map[string]string{"amount": "20000", "method": "BANK"}
	pay := func() *httptest.ResponseRecorder {
		req := h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep, body)
		req.Header.Set("Idempotency-Key", "payment-attempt-1")
		return h.send(req)
	}

	first := pay()
	if first.Code != http.StatusOK {
		t.Fatalf("first attempt = %d: %s", first.Code, first.Body)
	}

	second := pay()
	if second.Code != http.StatusOK {
		t.Fatalf("retry = %d: %s", second.Code, second.Body)
	}
	if second.Header().Get("Idempotent-Replay") != "true" {
		t.Error("the retry was not marked as a replay")
	}
	if first.Body.String() != second.Body.String() {
		t.Errorf("the retry returned a different response:\n first: %s\n retry: %s",
			first.Body, second.Body)
	}

	// One payment on the ledger, not two.
	var count int
	var paid string
	if err := h.pool.QueryRow(t.Context(),
		`SELECT count(*), COALESCE(SUM(amount),0)::text FROM payments WHERE invoice_id = $1`,
		invoiceID).Scan(&count, &paid); err != nil {
		t.Fatalf("read payments: %v", err)
	}
	if count != 1 {
		t.Errorf("%d payments recorded, want 1", count)
	}
	if paid != "20000.00" {
		t.Errorf("total paid = %s, want 20000.00", paid)
	}
}

// Two retries arriving at once must not both charge.
func TestConcurrentRetriesWithTheSameKeyChargeOnce(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)
	invoiceID := b.Invoices[0].ID

	body := map[string]string{"amount": "10000", "method": "BANK"}

	var wg sync.WaitGroup
	codes := make([]int, 4)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			req := h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep, body)
			req.Header.Set("Idempotency-Key", "concurrent-attempt")
			codes[i] = h.send(req).Code
		}(i)
	}
	wg.Wait()

	var count int
	if err := h.pool.QueryRow(t.Context(),
		`SELECT count(*) FROM payments WHERE invoice_id = $1`, invoiceID).Scan(&count); err != nil {
		t.Fatalf("read payments: %v", err)
	}
	if count != 1 {
		t.Fatalf("%d payments recorded from four concurrent retries, want 1 (codes: %v)", count, codes)
	}

	// One request does the work; the rest either replay it or are told it is
	// in flight. None of them charges again.
	var succeeded int
	for _, c := range codes {
		switch c {
		case http.StatusOK:
			succeeded++
		case http.StatusConflict:
		default:
			t.Errorf("unexpected status %d", c)
		}
	}
	if succeeded == 0 {
		t.Error("no request succeeded")
	}
}

func TestSameKeyWithADifferentBodyIsRejected(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)
	invoiceID := b.Invoices[0].ID

	req := h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "10000", "method": "BANK"})
	req.Header.Set("Idempotency-Key", "reused-key")
	if got := h.send(req).Code; got != http.StatusOK {
		t.Fatalf("first payment = %d", got)
	}

	// Reusing a key for a different amount is a client bug. Silently
	// replaying the first response would hide it.
	req = h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "5000", "method": "BANK"})
	req.Header.Set("Idempotency-Key", "reused-key")

	w := h.send(req)
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("reused key with a different body = %d, want 422: %s", w.Code, w.Body)
	}
}

// A failed request must release its key so the client can correct and retry.
func TestAFailedPaymentReleasesItsKey(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	b := generateBilling(t, h, rep, o.ID)
	invoiceID := b.Invoices[0].ID

	req := h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "99999999", "method": "BANK"})
	req.Header.Set("Idempotency-Key", "will-fail-then-succeed")
	if got := h.send(req).Code; got != http.StatusConflict {
		t.Fatalf("overpayment = %d, want 409", got)
	}

	// The same key now works for a corrected amount.
	req = h.request(http.MethodPost, "/api/v1/invoices/"+itoa(invoiceID)+"/payments", rep,
		map[string]string{"amount": "20000", "method": "BANK"})
	req.Header.Set("Idempotency-Key", "will-fail-then-succeed")
	if got := h.send(req).Code; got != http.StatusOK {
		t.Errorf("corrected retry = %d, want 200", got)
	}
}

// Adding seats halfway through a period costs half a period.
func TestMidCycleIncreaseIsProrated(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, lineID := hybridOrder(t, h, rep)
	before := generateBilling(t, h, rep, o.ID)
	firstPeriodBefore := before.Schedule[0].Amount

	w := h.do(http.MethodPost,
		"/api/v1/orders/"+itoa(o.ID)+"/subscriptions/"+itoa(lineID)+"/change", rep,
		map[string]any{"qty": "5"})
	if w.Code != http.StatusOK {
		t.Fatalf("increase = %d: %s", w.Code, w.Body)
	}

	var res struct {
		Proration struct {
			DaysInPeriod  int    `json:"days_in_period"`
			DaysRemaining int    `json:"days_remaining"`
			Factor        string `json:"factor"`
			Amount        string `json:"amount"`
			Kind          string `json:"kind"`
		} `json:"proration"`
		CreditNote *struct{} `json:"credit_note"`
		Billing    billingBody
	}
	decodeJSON(t, w, &res)

	if res.Proration.Kind != "CHARGE" {
		t.Errorf("kind = %s, want CHARGE", res.Proration.Kind)
	}
	if res.CreditNote != nil {
		t.Error("an increase produced a credit note")
	}
	// The change lands on day one of the current period, so the full period
	// is charged for the two added seats: 2 x 5000.
	if res.Proration.Factor != "1" {
		t.Errorf("factor = %s, want 1 on the first day of the period", res.Proration.Factor)
	}
	if res.Proration.Amount != "10000" {
		t.Errorf("adjustment = %s, want 10000", res.Proration.Amount)
	}

	// The current period carries the adjustment; later periods are repriced.
	if res.Billing.Schedule[0].Amount == firstPeriodBefore {
		t.Error("the current period was not adjusted")
	}
	if res.Billing.Schedule[1].Amount != "25000" {
		t.Errorf("next period = %s, want 25000 (five seats)", res.Billing.Schedule[1].Amount)
	}
}

// Removing seats produces a credit note for the unused remainder.
func TestMidCycleReductionProducesACreditNote(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, lineID := hybridOrder(t, h, rep)
	generateBilling(t, h, rep, o.ID)

	w := h.do(http.MethodPost,
		"/api/v1/orders/"+itoa(o.ID)+"/subscriptions/"+itoa(lineID)+"/change", rep,
		map[string]any{"qty": "1"})
	if w.Code != http.StatusOK {
		t.Fatalf("reduce = %d: %s", w.Code, w.Body)
	}

	var res struct {
		Proration struct {
			Kind   string `json:"kind"`
			Amount string `json:"amount"`
		} `json:"proration"`
		CreditNote *struct {
			Reference string `json:"reference"`
			Amount    string `json:"amount"`
			Reason    string `json:"reason"`
			Status    string `json:"status"`
		} `json:"credit_note"`
		Billing billingBody
	}
	decodeJSON(t, w, &res)

	if res.Proration.Kind != "CREDIT" {
		t.Fatalf("kind = %s, want CREDIT", res.Proration.Kind)
	}
	if res.CreditNote == nil {
		t.Fatal("no credit note was created")
	}
	if res.CreditNote.Amount != "10000" {
		t.Errorf("credit = %s, want 10000 (two seats for the full period)", res.CreditNote.Amount)
	}
	if res.CreditNote.Status != "ISSUED" {
		t.Errorf("status = %s, want ISSUED", res.CreditNote.Status)
	}
	if res.CreditNote.Reason == "" {
		t.Error("the credit note has no reason recorded")
	}
	if res.Billing.Schedule[1].Amount != "5000" {
		t.Errorf("next period = %s, want 5000 (one seat)", res.Billing.Schedule[1].Amount)
	}
}

// Cancelling outright stops future billing.
func TestCancellingASubscriptionStopsFutureBilling(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, lineID := hybridOrder(t, h, rep)
	generateBilling(t, h, rep, o.ID)

	w := h.do(http.MethodPost,
		"/api/v1/orders/"+itoa(o.ID)+"/subscriptions/"+itoa(lineID)+"/change", rep,
		map[string]any{"qty": "0"})
	if w.Code != http.StatusOK {
		t.Fatalf("cancel = %d: %s", w.Code, w.Body)
	}

	var res struct {
		CreditNote *struct {
			Amount string `json:"amount"`
		} `json:"credit_note"`
		Billing billingBody
	}
	decodeJSON(t, w, &res)

	if res.CreditNote == nil {
		t.Fatal("cancelling produced no credit note")
	}

	var cancelled int
	for _, s := range res.Billing.Schedule {
		if s.Status == "CANCELLED" {
			cancelled++
		}
	}
	if cancelled == 0 {
		t.Error("no future period was cancelled")
	}
}

// Generate is deliberately safe to call more than once: it only ever creates
// the one-time invoice, or the recurring schedule, that does not already
// exist. A second call must return the same billing state, not duplicate it.
func TestGeneratingBillingTwiceDoesNotDuplicateIt(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	_, o, _ := hybridOrder(t, h, rep)
	first := generateBilling(t, h, rep, o.ID)

	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/invoices", rep, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("second generation = %d, want 201: %s", w.Code, w.Body)
	}
	var second billingBody
	decodeJSON(t, w, &second)

	if len(second.Invoices) != len(first.Invoices) {
		t.Errorf("invoices = %d after a second call, want %d (no duplicate)", len(second.Invoices), len(first.Invoices))
	}
	if len(second.Schedule) != len(first.Schedule) {
		t.Errorf("schedule rows = %d after a second call, want %d (no duplicate)", len(second.Schedule), len(first.Schedule))
	}
}

func TestOnlyRecurringLinesHaveASubscriptionQuantity(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, o, _ := hybridOrder(t, h, rep)
	generateBilling(t, h, rep, o.ID)

	var oneTimeLine int64
	for _, l := range q.Lines {
		if l.LineType == "ONETIME" {
			oneTimeLine = l.ID
		}
	}

	w := h.do(http.MethodPost,
		"/api/v1/orders/"+itoa(o.ID)+"/subscriptions/"+itoa(oneTimeLine)+"/change", rep,
		map[string]any{"qty": "5"})
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("changing a one-time line = %d, want 422: %s", w.Code, w.Body)
	}
}
