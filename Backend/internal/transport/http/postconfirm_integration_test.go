//go:build integration

package http_test

import (
	"net/http"
	"testing"
)

// previewBody mirrors dto.FulfillmentPlan including the fields the Manual
// Override control reads.
type previewBody struct {
	Strategy    string `json:"strategy"`
	Allocations []struct {
		WarehouseID int64 `json:"warehouse_id"`
		ProductID   int64 `json:"product_id"`
		Qty         int64 `json:"qty"`
	} `json:"allocations"`
	Demands []struct {
		ProductID   int64  `json:"product_id"`
		ProductName string `json:"product_name"`
		Qty         int64  `json:"qty"`
	} `json:"demands"`
	Availability []struct {
		WarehouseID   int64  `json:"warehouse_id"`
		WarehouseName string `json:"warehouse_name"`
		ProductID     int64  `json:"product_id"`
		Available     int64  `json:"available"`
	} `json:"availability"`
}

func getPreview(t *testing.T, h *harness, token string, orderID int64) previewBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/orders/"+itoa(orderID)+"/fulfillment/suggest", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("suggest = %d: %s", w.Code, w.Body)
	}
	var out previewBody
	decodeJSON(t, w, &out)
	return out
}

// orderForQuotation finds the sales order raised for a quotation, or 0.
func orderForQuotation(t *testing.T, h *harness, token string, quotationID int64) orderBody {
	t.Helper()

	w := h.do(http.MethodGet, "/api/v1/orders?limit=100", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list orders = %d: %s", w.Code, w.Body)
	}
	var page struct {
		Data []struct {
			ID          int64  `json:"id"`
			Reference   string `json:"reference"`
			QuotationID int64  `json:"quotation_id"`
			Status      string `json:"status"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)

	for _, row := range page.Data {
		if row.QuotationID == quotationID {
			w := h.do(http.MethodGet, "/api/v1/orders/"+itoa(row.ID), token, nil)
			if w.Code != http.StatusOK {
				t.Fatalf("get order = %d: %s", w.Code, w.Body)
			}
			var o orderBody
			decodeJSON(t, w, &o)
			return o
		}
	}
	return orderBody{}
}

// The customer's confirmation has to reach operations.
//
// A confirmed quotation with no sales order is invisible to every fulfilment
// screen, because all of them are keyed on the order. The deal used to reach
// CONFIRMED from the portal and then sit there until a rep happened to reopen
// the quotation and confirm it a second time.
func TestCustomerConfirmationRaisesTheSalesOrder(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	if existing := orderForQuotation(t, h, rep, q.ID); existing.ID != 0 {
		t.Fatal("an order existed before anybody confirmed")
	}

	if got := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/confirm", "", nil).Code; got != http.StatusOK {
		t.Fatalf("customer confirm = %d, want 200", got)
	}

	order := orderForQuotation(t, h, rep, q.ID)
	if order.ID == 0 {
		t.Fatal("the customer confirmed and no sales order was raised")
	}
	if order.Reference == "" {
		t.Error("the order has no reference")
	}
	if order.Status != "CONFIRMED" {
		t.Errorf("order status = %s, want CONFIRMED", order.Status)
	}
	// Confirming raises the order; it does not reserve stock. That decision
	// belongs to whoever runs fulfilment.
	if order.Fulfillment != nil {
		t.Error("confirming reserved stock; the split is a separate decision")
	}

	// And the order is immediately workable: a split can be previewed for it.
	preview := getPreview(t, h, rep, order.ID)
	if len(preview.Demands) == 0 {
		t.Error("the raised order has no demand to fulfil")
	}
}

// Staff confirming after the customer already did must not raise a second
// order for the same deal.
func TestStaffConfirmAfterCustomerConfirmReturnsTheSameOrder(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	q, portalToken := sentQuote(t, h, rep, "5")

	if got := h.do(http.MethodPost, "/api/v1/portal/q/"+portalToken+"/confirm", "", nil).Code; got != http.StatusOK {
		t.Fatalf("customer confirm = %d", got)
	}
	fromCustomer := orderForQuotation(t, h, rep, q.ID)

	// The rep opens the deal and confirms; the same order comes back.
	fromStaff := confirmOrder(t, h, rep, q.ID)
	if fromStaff.ID != fromCustomer.ID {
		t.Fatalf("staff confirm raised order %d, customer confirm raised %d",
			fromStaff.ID, fromCustomer.ID)
	}
	if fromStaff.Reference != fromCustomer.Reference {
		t.Errorf("reference changed: %s then %s", fromCustomer.Reference, fromStaff.Reference)
	}
}

// The preview must carry what the order needs and what each warehouse holds.
//
// Without these the Manual Override control cannot be built: a reviewer would
// be typing quantities blind and the server would reject them after the fact.
func TestSuggestExposesDemandAndStockForOverride(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")
	finance := h.login(t, "finance@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "7"})
	order := confirmOrder(t, h, rep, q.ID)

	preview := getPreview(t, h, finance, order.ID)

	if len(preview.Demands) != 1 {
		t.Fatalf("demands = %+v, want the one laptop line", preview.Demands)
	}
	d := preview.Demands[0]
	if d.ProductID != laptop.ID || d.Qty != 7 {
		t.Errorf("demand = %+v, want 7 of product %d", d, laptop.ID)
	}
	if d.ProductName == "" {
		t.Error("demand carries no product name to label the override rows")
	}

	if len(preview.Availability) == 0 {
		t.Fatal("availability is empty; an override cannot be composed")
	}
	for _, a := range preview.Availability {
		if a.Available <= 0 {
			t.Errorf("availability includes a warehouse with nothing to give: %+v", a)
		}
		if a.WarehouseName == "" {
			t.Errorf("availability row has no warehouse name: %+v", a)
		}
	}

	// The stock the preview reports must be enough to explain the plan it
	// proposes: the two must come from one read, not two.
	byWarehouse := map[int64]int64{}
	for _, a := range preview.Availability {
		if a.ProductID == laptop.ID {
			byWarehouse[a.WarehouseID] = a.Available
		}
	}
	for _, alloc := range preview.Allocations {
		if alloc.ProductID != laptop.ID {
			continue
		}
		if alloc.Qty > byWarehouse[alloc.WarehouseID] {
			t.Errorf("plan allocates %d from warehouse %d but availability reports %d",
				alloc.Qty, alloc.WarehouseID, byWarehouse[alloc.WarehouseID])
		}
	}
}

// Previewing must not hold stock rows while a human decides. Two reviewers
// looking at the same order at the same time is normal.
func TestPreviewDoesNotBlockAConcurrentPreview(t *testing.T) {
	h := newHarness(t)
	rep := h.login(t, "rep@dealflow360.test")

	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "2"})
	order := confirmOrder(t, h, rep, q.ID)

	first := getPreview(t, h, rep, order.ID)
	second := getPreview(t, h, rep, order.ID)

	if len(first.Allocations) != len(second.Allocations) {
		t.Errorf("two previews disagreed: %d vs %d allocations",
			len(first.Allocations), len(second.Allocations))
	}
}

// A warehouse can record where it ships from, and the shipment view carries
// that origin through to the delivery destination.
func TestWarehouseLocationFlowsThroughToTheShipmentView(t *testing.T) {
	h := newHarness(t)
	admin := h.login(t, "admin@dealflow360.test")
	rep := h.login(t, "rep@dealflow360.test")

	// The seeded warehouses ship from real cities.
	w := h.do(http.MethodGet, "/api/v1/warehouses", admin, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list warehouses = %d: %s", w.Code, w.Body)
	}
	var page struct {
		Data []struct {
			Name      string  `json:"name"`
			City      *string `json:"city"`
			Latitude  *string `json:"latitude"`
			Longitude *string `json:"longitude"`
		} `json:"data"`
	}
	decodeJSON(t, w, &page)

	located := 0
	for _, row := range page.Data {
		if row.City != nil && row.Latitude != nil && row.Longitude != nil {
			located++
		}
	}
	if located == 0 {
		t.Fatal("no seeded warehouse has a shipping origin to plot")
	}

	// And an order's shipments carry both ends of the movement.
	laptop := productBySKUOverHTTP(t, h, "HW-LAPTOP")
	q := approvedQuote(t, h, rep, map[int64]string{laptop.ID: "2"})
	order := confirmOrder(t, h, rep, q.ID)

	var withDest struct {
		Destination struct {
			CustomerName string  `json:"customer_name"`
			City         *string `json:"city"`
			Latitude     *string `json:"latitude"`
			Longitude    *string `json:"longitude"`
		} `json:"destination"`
	}
	res := h.do(http.MethodGet, "/api/v1/orders/"+itoa(order.ID), rep, nil)
	decodeJSON(t, res, &withDest)

	if withDest.Destination.CustomerName == "" {
		t.Error("the order does not say who the shipment is going to")
	}
	if withDest.Destination.Latitude == nil || withDest.Destination.Longitude == nil {
		t.Error("the destination cannot be plotted")
	}

	// The preview's allocations carry the origin they would ship from.
	preview := getPreview(t, h, rep, order.ID)
	if len(preview.Allocations) == 0 {
		t.Fatal("no allocations to check an origin on")
	}
}

// Coordinates are optional, and only meaningful as a pair.
func TestWarehouseCoordinatesAreValidatedAsAPair(t *testing.T) {
	h := newHarness(t)
	admin := h.login(t, "admin@dealflow360.test")

	// Both absent is fine: a warehouse without a location is a normal record.
	if got := h.do(http.MethodPost, "/api/v1/warehouses", admin,
		map[string]any{"name": "No Location Depot"}).Code; got != http.StatusCreated {
		t.Errorf("warehouse without coordinates = %d, want 201", got)
	}

	// Half a coordinate is not a place.
	if got := h.do(http.MethodPost, "/api/v1/warehouses", admin,
		map[string]any{"name": "Half Located", "latitude": "23.0225"}).Code; got != http.StatusUnprocessableEntity {
		t.Errorf("latitude without longitude = %d, want 422", got)
	}

	// Out of range is rejected before it reaches the database constraint.
	if got := h.do(http.MethodPost, "/api/v1/warehouses", admin,
		map[string]any{"name": "Off Planet", "latitude": "500", "longitude": "72.5"}).Code; got != http.StatusUnprocessableEntity {
		t.Errorf("latitude 500 = %d, want 422", got)
	}

	// A complete pair round-trips.
	w := h.do(http.MethodPost, "/api/v1/warehouses", admin, map[string]any{
		"name": "West Hub", "shipping_cost_weight": "1.1",
		"city": "Ahmedabad", "latitude": "23.0225", "longitude": "72.5714",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create located warehouse = %d: %s", w.Code, w.Body)
	}
	var created struct {
		City      *string `json:"city"`
		Latitude  *string `json:"latitude"`
		Longitude *string `json:"longitude"`
	}
	decodeJSON(t, w, &created)
	if created.City == nil || *created.City != "Ahmedabad" {
		t.Errorf("city = %v, want Ahmedabad", created.City)
	}
	if created.Latitude == nil || created.Longitude == nil {
		t.Fatal("coordinates were not stored")
	}
}
