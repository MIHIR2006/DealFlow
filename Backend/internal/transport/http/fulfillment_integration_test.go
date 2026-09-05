//go:build integration

package http_test

import (
	"net/http"
	"sync"
	"testing"
)

// orderBody mirrors dto.SalesOrder. The fulfillment split, once persisted,
// lives under Fulfillment.Lines (flat, grouped by ShipmentGroup) rather than
// under a "plan" — "plan" is only the shape of the free-standing preview
// GET /orders/:id/fulfillment/suggest returns, via planBody below.
type orderBody struct {
	ID           int64  `json:"id"`
	Reference    string `json:"reference"`
	Status       string `json:"status"`
	QuotationID  int64  `json:"quotation_id"`
	CustomerName string `json:"customer_name"`
	PromisedDate string `json:"promised_date"`

	Fulfillment *struct {
		ID               int64  `json:"id"`
		Strategy         string `json:"strategy"`
		ShipmentCount    int    `json:"shipment_count"`
		EstimatedCost    string `json:"estimated_cost"`
		IsManualOverride bool   `json:"is_manual_override"`
		Lines            []struct {
			WarehouseID   int64  `json:"warehouse_id"`
			WarehouseName string `json:"warehouse_name"`
			ProductID     int64  `json:"product_id"`
			ProductName   string `json:"product_name"`
			Qty           int64  `json:"qty"`
			ShipmentGroup int    `json:"shipment_group"`
		} `json:"lines"`
	} `json:"fulfillment"`

	Backorders []struct {
		ID        int64  `json:"id"`
		ProductID int64  `json:"product_id"`
		Qty       int64  `json:"qty"`
		Status    string `json:"status"`
	} `json:"backorders"`
}

// planBody mirrors dto.FulfillmentPlan, the shape of a non-persisted preview.
type planBody struct {
	Strategy      string `json:"strategy"`
	ShipmentCount int    `json:"shipment_count"`
	EstimatedCost string `json:"estimated_cost"`
	Allocations   []struct {
		WarehouseID   int64  `json:"warehouse_id"`
		WarehouseName string `json:"warehouse_name"`
		ProductID     int64  `json:"product_id"`
		ProductName   string `json:"product_name"`
		Qty           int64  `json:"qty"`
		ShipmentGroup int    `json:"shipment_group"`
	} `json:"allocations"`
	Backorders []struct {
		ProductID int64  `json:"product_id"`
		Qty       int64  `json:"qty"`
		Status    string `json:"status"`
	} `json:"backorders"`
	FullyFulfilled bool `json:"fully_fulfilled"`
}

// approvedQuote builds a compliant quotation for the given products and takes
// it through to APPROVED, ready to confirm.
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
	decodeJSON(t, w, &q)
	if q.Status != "APPROVED" {
		t.Fatalf("status = %s, want APPROVED (the fixture must be compliant)", q.Status)
	}
	return q
}

func confirmOrder(t *testing.T, h *harness, token string, quotationID int64) orderBody {
	t.Helper()

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(quotationID)+"/confirm", token, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("confirm = %d: %s", w.Code, w.Body)
	}

	var o orderBody
	decodeJSON(t, w, &o)
	return o
}

// The demo split: seven laptops against five at Main and one at East gives
// two shipments and exactly one backordered unit.
func TestSuggestReproducesTheDemoSplit(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	docking := productBySKUOverHTTP(t, h, "HW-DOCK")

	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "7", docking.ID: "1"})
	o := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodGet, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment/suggest", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("suggest = %d: %s", w.Code, w.Body)
	}
	var plan planBody
	decodeJSON(t, w, &plan)

	if plan.Strategy != "GREEDY_SPLIT" {
		t.Errorf("strategy = %s, want GREEDY_SPLIT", plan.Strategy)
	}
	if plan.ShipmentCount != 2 {
		t.Errorf("shipments = %d, want 2", plan.ShipmentCount)
	}
	if len(plan.Backorders) != 1 || plan.Backorders[0].Qty != 1 {
		t.Errorf("backorders = %+v, want one unit", plan.Backorders)
	}
	if plan.FullyFulfilled {
		t.Error("a plan with a backorder must not report fully fulfilled")
	}

	// Suggesting must persist nothing: the order is untouched and no stock
	// has been reserved.
	var reserved int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT COALESCE(SUM(reserved),0) FROM stock_items WHERE product_id = $1`,
		laptop.ID).Scan(&reserved); err != nil {
		t.Fatalf("read reserved: %v", err)
	}
	if reserved != 0 {
		t.Errorf("suggesting reserved %d units; it must persist nothing", reserved)
	}
}

func TestAcceptReservesStockAndRecordsBackorders(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "7"})
	o := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("accept = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &o)

	// Six of the seven are available; the seventh is backordered.
	if o.Status != "PARTIALLY_FULFILLED" {
		t.Errorf("status = %s, want PARTIALLY_FULFILLED", o.Status)
	}
	if o.Fulfillment == nil {
		t.Fatal("no fulfillment persisted")
	}
	var allocated int64
	for _, a := range o.Fulfillment.Lines {
		allocated += a.Qty
	}
	if allocated != 6 {
		t.Errorf("allocated %d, want 6", allocated)
	}
	if len(o.Backorders) != 1 || o.Backorders[0].Qty != 1 {
		t.Errorf("backorders = %+v, want one unit", o.Backorders)
	}
	if o.Fulfillment.IsManualOverride {
		t.Error("an engine-chosen split must not be marked as a manual override")
	}

	var reserved int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT COALESCE(SUM(reserved),0) FROM stock_items WHERE product_id = $1`,
		laptop.ID).Scan(&reserved); err != nil {
		t.Fatalf("read reserved: %v", err)
	}
	if reserved != 6 {
		t.Errorf("reserved %d units, want 6 to match the allocations", reserved)
	}
}

func TestSingleWarehouseOrderShipsInOnePiece(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "3"})
	o := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil)
	decodeJSON(t, w, &o)

	if o.Fulfillment == nil {
		t.Fatal("no fulfillment persisted")
	}
	if o.Fulfillment.Strategy != "SINGLE_WAREHOUSE" {
		t.Errorf("strategy = %s, want SINGLE_WAREHOUSE", o.Fulfillment.Strategy)
	}
	if o.Status != "FULFILLED" {
		t.Errorf("status = %s, want FULFILLED", o.Status)
	}
	if len(o.Backorders) != 0 {
		t.Errorf("backorders = %+v, want none", o.Backorders)
	}
}

// The whole point of the lock: two orders racing for the last units must not
// both be told they have them.
func TestConcurrentAcceptsCannotOversell(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	// Six laptops exist in total. Two orders of four each cannot both be
	// filled, so between them they must reserve exactly six.
	var orders []int64
	for i := 0; i < 2; i++ {
		q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "4"})
		orders = append(orders, confirmOrder(t, h, rep, q.ID).ID)
	}

	var wg sync.WaitGroup
	codes := make([]int, len(orders))
	for i, id := range orders {
		wg.Add(1)
		go func(i int, id int64) {
			defer wg.Done()
			codes[i] = h.do(http.MethodPost, "/api/v1/orders/"+itoa(id)+"/fulfillment", rep, nil).Code
		}(i, id)
	}
	wg.Wait()

	for i, code := range codes {
		if code != http.StatusOK {
			t.Errorf("order %d = %d; a shortfall should backorder, not fail", i, code)
		}
	}

	var onHand, reserved int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT COALESCE(SUM(on_hand),0), COALESCE(SUM(reserved),0)
		   FROM stock_items WHERE product_id = $1`, laptop.ID).Scan(&onHand, &reserved); err != nil {
		t.Fatalf("read stock: %v", err)
	}

	if reserved > onHand {
		t.Fatalf("reserved %d of %d on hand: the system oversold", reserved, onHand)
	}
	if reserved != onHand {
		t.Errorf("reserved %d of %d; both orders together should take every unit", reserved, onHand)
	}

	// The schema's own guard agrees.
	var violations int
	if err := h.pool.QueryRow(t.Context(),
		`SELECT count(*) FROM stock_items WHERE reserved > on_hand`).Scan(&violations); err != nil {
		t.Fatalf("check invariant: %v", err)
	}
	if violations != 0 {
		t.Errorf("%d stock rows have more reserved than on hand", violations)
	}
}

// Overruling the engine is allowed; promising units that are not there is not.
func TestManualOverrideIsHonouredButValidated(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	var mainWH, eastWH int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM warehouses WHERE name = 'Main Warehouse'`).Scan(&mainWH); err != nil {
		t.Fatalf("find Main: %v", err)
	}
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM warehouses WHERE name = 'East Depot'`).Scan(&eastWH); err != nil {
		t.Fatalf("find East: %v", err)
	}

	// Main holds five laptops; asking for six there must be refused.
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "6"})
	o := confirmOrder(t, h, rep, q.ID)

	bad := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, map[string]any{
		"overrides": []map[string]any{
			{"warehouse_id": mainWH, "product_id": laptop.ID, "qty": 6},
		},
	})
	if bad.Code != http.StatusConflict {
		t.Errorf("over-allocating a warehouse = %d, want 409: %s", bad.Code, bad.Body)
	}

	// East first, though the engine would have preferred Main. Two of the six
	// remain unallocated and become a backorder.
	good := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, map[string]any{
		"overrides": []map[string]any{
			{"warehouse_id": eastWH, "product_id": laptop.ID, "qty": 1},
			{"warehouse_id": mainWH, "product_id": laptop.ID, "qty": 3},
		},
	})
	if good.Code != http.StatusOK {
		t.Fatalf("valid override = %d: %s", good.Code, good.Body)
	}
	decodeJSON(t, good, &o)

	if o.Fulfillment == nil || !o.Fulfillment.IsManualOverride {
		t.Error("the fulfillment is not marked as a manual override")
	}
	if len(o.Backorders) != 1 || o.Backorders[0].Qty != 2 {
		t.Errorf("backorders = %+v, want two units left over", o.Backorders)
	}

	byWarehouse := map[int64]int64{}
	for _, a := range o.Fulfillment.Lines {
		byWarehouse[a.WarehouseID] += a.Qty
	}
	if byWarehouse[eastWH] != 1 || byWarehouse[mainWH] != 3 {
		t.Errorf("allocations = %v, want the override's split", byWarehouse)
	}
}

func TestOverrideCannotAllocateMoreThanTheOrderNeeds(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	var mainWH int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM warehouses WHERE name = 'Main Warehouse'`).Scan(&mainWH); err != nil {
		t.Fatalf("find Main: %v", err)
	}

	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "2"})
	o := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, map[string]any{
		"overrides": []map[string]any{
			{"warehouse_id": mainWH, "product_id": docking.ID, "qty": 5},
		},
	})
	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("over-allocating the order = %d, want 422: %s", w.Code, w.Body)
	}
}

// The consolidate prompt: stock arrives, the shortfall ships as a further
// group on the same plan.
func TestBackorderConsolidatesWhenStockArrives(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	admin := h.login(t, "admin@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "7"})
	o := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil)
	decodeJSON(t, w, &o)
	if o.Status != "PARTIALLY_FULFILLED" {
		t.Fatalf("status = %s, want PARTIALLY_FULFILLED", o.Status)
	}
	if o.Fulfillment == nil {
		t.Fatal("no fulfillment persisted")
	}
	shipmentsBefore := len(o.Fulfillment.Lines)

	// Nothing to consolidate yet.
	early := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/backorders/consolidate", rep, nil)
	if early.Code != http.StatusConflict {
		t.Errorf("consolidating with no stock = %d, want 409: %s", early.Code, early.Body)
	}

	// Stock arrives at East.
	var eastWH int64
	if err := h.pool.QueryRow(t.Context(),
		`SELECT id FROM warehouses WHERE name = 'East Depot'`).Scan(&eastWH); err != nil {
		t.Fatalf("find East: %v", err)
	}
	add := h.do(http.MethodPost, "/api/v1/warehouses/"+itoa(eastWH)+"/stock", admin,
		map[string]any{"product_id": laptop.ID, "qty": 5})
	if add.Code != http.StatusOK {
		t.Fatalf("add stock = %d: %s", add.Code, add.Body)
	}

	w = h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/backorders/consolidate", rep, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("consolidate = %d: %s", w.Code, w.Body)
	}
	decodeJSON(t, w, &o)

	if o.Status != "FULFILLED" {
		t.Errorf("status = %s, want FULFILLED once the backorder cleared", o.Status)
	}
	if len(o.Backorders) != 0 {
		t.Errorf("backorders remain: %+v", o.Backorders)
	}
	if o.Fulfillment == nil {
		t.Fatal("no fulfillment persisted")
	}
	if len(o.Fulfillment.Lines) <= shipmentsBefore {
		t.Error("no new allocation was added for the consolidated units")
	}

	// The consolidated shipment continues the original numbering rather than
	// starting again, so the order reads as one delivery in parts.
	maxGroup := 0
	for _, a := range o.Fulfillment.Lines {
		if a.ShipmentGroup > maxGroup {
			maxGroup = a.ShipmentGroup
		}
	}
	if maxGroup <= shipmentsBefore {
		t.Errorf("highest shipment group is %d; the consolidation did not continue the numbering", maxGroup)
	}
}

func TestOnlyApprovedQuotationsCanBeConfirmed(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")

	// A draft has not been through governance.
	draft := newQuote(t, h, rep, "Acme Corporation")
	addLine(t, h, rep, draft.ID, laptop.ID, "1", "0")
	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(draft.ID)+"/confirm", rep, nil)
	if w.Code != http.StatusConflict {
		t.Errorf("confirming a draft = %d, want 409: %s", w.Code, w.Body)
	}

	// One awaiting approval has not cleared it.
	pending := flaggedQuote(t, h, rep)
	w = h.do(http.MethodPost, "/api/v1/quotations/"+itoa(pending.ID)+"/confirm", rep, nil)
	if w.Code != http.StatusConflict {
		t.Errorf("confirming a pending quotation = %d, want 409: %s", w.Code, w.Body)
	}
}

// Confirm is deliberately safe to call more than once: a quotation that
// already has an order just returns that same order rather than erroring, so
// a retried confirm request is harmless.
func TestConfirmingAQuotationTwiceReturnsTheSameOrder(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "1"})
	first := confirmOrder(t, h, rep, q.ID)

	w := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/confirm", rep, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("second confirm = %d, want 201: %s", w.Code, w.Body)
	}
	var second orderBody
	decodeJSON(t, w, &second)
	if second.ID != first.ID {
		t.Errorf("second confirm order id = %d, want the same order %d", second.ID, first.ID)
	}
}

// Recording a second plan would reserve the same stock twice.
func TestFulfilmentCannotBeAcceptedTwice(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "1"})
	o := confirmOrder(t, h, rep, q.ID)

	if got := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil).Code; got != http.StatusOK {
		t.Fatalf("first accept = %d", got)
	}
	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil)
	if w.Code != http.StatusConflict {
		t.Errorf("second accept = %d, want 409: %s", w.Code, w.Body)
	}
}

// Subscription lines are billed, never shipped.
func TestRecurringLinesAreNotFulfilled(t *testing.T) {
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
	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/lines", rep, map[string]any{
		"product_id": support.ID, "qty": "3", "discount_pct": "0", "plan_id": planID,
	}).Code; got != http.StatusOK {
		t.Fatalf("add subscription line = %d", got)
	}
	if got := h.do(http.MethodPost, "/api/v1/quotations/"+itoa(q.ID)+"/submit", rep, nil).Code; got != http.StatusOK {
		t.Fatalf("submit = %d", got)
	}

	o := confirmOrder(t, h, rep, q.ID)
	w := h.do(http.MethodPost, "/api/v1/orders/"+itoa(o.ID)+"/fulfillment", rep, nil)
	decodeJSON(t, w, &o)

	if o.Fulfillment == nil {
		t.Fatal("no fulfillment persisted")
	}
	for _, a := range o.Fulfillment.Lines {
		if a.ProductID == support.ID {
			t.Errorf("the subscription line was allocated for shipping: %+v", a)
		}
	}
	if len(o.Fulfillment.Lines) != 1 {
		t.Errorf("allocations = %+v, want only the hardware line", o.Fulfillment.Lines)
	}
}

// Orders inherit the quotation's visibility rules.
func TestOrderVisibilityFollowsTheQuotation(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	other := h.login(t, "rep2@dealflow360.test")

	docking := productBySKUOverHTTP(t, h, "HW-DOCK")
	q := approvedQuote(t, h, rep, map[int64]string{docking.ID: "1"})
	o := confirmOrder(t, h, rep, q.ID)

	if got := h.do(http.MethodGet, "/api/v1/orders/"+itoa(o.ID), other, nil).Code; got != http.StatusNotFound {
		t.Errorf("another rep reading the order = %d, want 404", got)
	}
	if got := h.do(http.MethodGet, "/api/v1/orders/"+itoa(o.ID), rep, nil).Code; got != http.StatusOK {
		t.Errorf("owner reading the order = %d, want 200", got)
	}
}
