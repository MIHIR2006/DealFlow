package fulfillment_test

import (
	"math/rand"
	"reflect"
	"testing"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/domain/money"
)

func d(s string) decimal.Decimal { return money.MustFromString(s) }

const (
	laptop  int64 = 1
	docking int64 = 2
)

const (
	mainWH int64 = 1
	east   int64 = 2
	south  int64 = 3
)

func demoWarehouses() []fulfillment.Warehouse {
	return []fulfillment.Warehouse{
		{ID: mainWH, Name: "Main Warehouse", ShippingCostWeight: d("1.0")},
		{ID: east, Name: "East Depot", ShippingCostWeight: d("1.4")},
		{ID: south, Name: "South Hub", ShippingCostWeight: d("1.2")},
	}
}

// allocated totals the units placed at a warehouse for a product.
func allocated(p fulfillment.Plan, whID, productID int64) int64 {
	var total int64
	for _, a := range p.Allocations {
		if a.WarehouseID == whID && a.ProductID == productID {
			total += a.Qty
		}
	}
	return total
}

// TestDemoScenario is the fulfilment case walked through in the demo:
// seven laptops and one docking station, with stock spread thin.
//
//	          Main  East  South
//	Laptop      5     1      0
//	Docking    10    10      0
//
// Main covers the most value, East covers one more laptop, and the last
// laptop is backordered. Two shipments, one backorder.
func TestDemoScenario(t *testing.T) {
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 7, UnitValue: d("45000")},
		{ProductID: docking, ProductName: "Docking Station", Qty: 1, UnitValue: d("8000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 5},
		{WarehouseID: mainWH, ProductID: docking, Available: 10},
		{WarehouseID: east, ProductID: laptop, Available: 1},
		{WarehouseID: east, ProductID: docking, Available: 10},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if got.Strategy != fulfillment.StrategyGreedySplit {
		t.Errorf("Strategy = %s, want GREEDY_SPLIT", got.Strategy)
	}
	if got.ShipmentCount != 2 {
		t.Errorf("ShipmentCount = %d, want 2", got.ShipmentCount)
	}
	if n := allocated(got, mainWH, laptop); n != 5 {
		t.Errorf("Main laptops = %d, want 5", n)
	}
	if n := allocated(got, mainWH, docking); n != 1 {
		t.Errorf("Main docking = %d, want 1", n)
	}
	if n := allocated(got, east, laptop); n != 1 {
		t.Errorf("East laptops = %d, want 1", n)
	}
	if len(got.Backorders) != 1 {
		t.Fatalf("Backorders = %+v, want exactly one", got.Backorders)
	}
	if got.Backorders[0].ProductID != laptop || got.Backorders[0].Qty != 1 {
		t.Errorf("Backorder = %+v, want 1 laptop", got.Backorders[0])
	}
	if got.FullyFulfilled() {
		t.Error("FullyFulfilled() = true, want false with an outstanding backorder")
	}
}

func TestSingleWarehousePreferredOverCheaperSplit(t *testing.T) {
	// Main can ship everything. Splitting across two cheaper warehouses might
	// cost marginally less, but the objective is fewest shipments.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 3, UnitValue: d("45000")},
		{ProductID: docking, ProductName: "Docking", Qty: 2, UnitValue: d("8000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 10},
		{WarehouseID: mainWH, ProductID: docking, Available: 10},
		{WarehouseID: east, ProductID: laptop, Available: 10},
		{WarehouseID: east, ProductID: docking, Available: 10},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if got.Strategy != fulfillment.StrategySingleWarehouse {
		t.Errorf("Strategy = %s, want SINGLE_WAREHOUSE", got.Strategy)
	}
	if got.ShipmentCount != 1 {
		t.Errorf("ShipmentCount = %d, want 1", got.ShipmentCount)
	}
	if !got.FullyFulfilled() {
		t.Error("FullyFulfilled() = false, want true")
	}
}

func TestSingleWarehouseChoosesCheapestCapableOrigin(t *testing.T) {
	// Both East (1.4) and Main (1.0) can cover the order; Main is cheaper.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 2, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: east, ProductID: laptop, Available: 5},
		{WarehouseID: mainWH, ProductID: laptop, Available: 5},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if got.Allocations[0].WarehouseID != mainWH {
		t.Errorf("shipped from warehouse %d, want the cheaper Main (%d)",
			got.Allocations[0].WarehouseID, mainWH)
	}
	if !got.EstimatedCost.Equal(d("1")) {
		t.Errorf("EstimatedCost = %s, want 1.0", got.EstimatedCost)
	}
}

func TestZeroStockEverywhereBackordersWithoutFailing(t *testing.T) {
	// The order must still confirm; the shortfall is resolved later.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 4, UnitValue: d("45000")},
	}

	got := fulfillment.Split(demands, nil, demoWarehouses())

	if len(got.Allocations) != 0 {
		t.Errorf("Allocations = %+v, want none", got.Allocations)
	}
	if got.ShipmentCount != 0 {
		t.Errorf("ShipmentCount = %d, want 0", got.ShipmentCount)
	}
	if len(got.Backorders) != 1 || got.Backorders[0].Qty != 4 {
		t.Errorf("Backorders = %+v, want the full 4 units", got.Backorders)
	}
}

func TestPartialStockIsAllocatedBeforeBackordering(t *testing.T) {
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 10, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 3},
		{WarehouseID: east, ProductID: laptop, Available: 2},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if n := allocated(got, mainWH, laptop) + allocated(got, east, laptop); n != 5 {
		t.Errorf("allocated %d units, want all 5 available", n)
	}
	if got.Backorders[0].Qty != 5 {
		t.Errorf("Backorder qty = %d, want the 5 unavailable units", got.Backorders[0].Qty)
	}
}

func TestExactCoverLeavesNoBackorder(t *testing.T) {
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 5, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 3},
		{WarehouseID: east, ProductID: laptop, Available: 2},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if !got.FullyFulfilled() {
		t.Errorf("Backorders = %+v, want none", got.Backorders)
	}
	if got.ShipmentCount != 2 {
		t.Errorf("ShipmentCount = %d, want 2", got.ShipmentCount)
	}
}

func TestGreedyPrefersHigherValueCoverage(t *testing.T) {
	// East holds one expensive laptop; South holds ten cheap dockings.
	// By unit count South covers more, but East covers more value.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 1, UnitValue: d("45000")},
		{ProductID: docking, ProductName: "Docking", Qty: 10, UnitValue: d("800")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: east, ProductID: laptop, Available: 1},
		{WarehouseID: south, ProductID: docking, Available: 10},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if len(got.Allocations) == 0 {
		t.Fatal("no allocations produced")
	}
	if got.Allocations[0].WarehouseID != east {
		t.Errorf("first shipment from warehouse %d, want East (%d) which covers more value",
			got.Allocations[0].WarehouseID, east)
	}
}

func TestPlanIsDeterministicRegardlessOfInputOrder(t *testing.T) {
	// The plan is shown to a customer before it is persisted, so shuffled
	// inputs must not produce a different answer.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 7, UnitValue: d("45000")},
		{ProductID: docking, ProductName: "Docking", Qty: 1, UnitValue: d("8000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 5},
		{WarehouseID: mainWH, ProductID: docking, Available: 10},
		{WarehouseID: east, ProductID: laptop, Available: 1},
		{WarehouseID: east, ProductID: docking, Available: 10},
	}
	warehouses := demoWarehouses()

	want := fulfillment.Split(demands, stock, warehouses)

	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 50; i++ {
		s := append([]fulfillment.Stock(nil), stock...)
		w := append([]fulfillment.Warehouse(nil), warehouses...)
		dm := append([]fulfillment.Demand(nil), demands...)

		rng.Shuffle(len(s), func(a, b int) { s[a], s[b] = s[b], s[a] })
		rng.Shuffle(len(w), func(a, b int) { w[a], w[b] = w[b], w[a] })
		rng.Shuffle(len(dm), func(a, b int) { dm[a], dm[b] = dm[b], dm[a] })

		if got := fulfillment.Split(dm, s, w); !reflect.DeepEqual(got, want) {
			t.Fatalf("iteration %d produced a different plan:\n got %+v\nwant %+v", i, got, want)
		}
	}
}

func TestEmptyDemandProducesAnEmptyPlan(t *testing.T) {
	got := fulfillment.Split(nil, nil, demoWarehouses())

	if got.Strategy != fulfillment.StrategyNothingToShip {
		t.Errorf("Strategy = %s, want NOTHING_TO_SHIP", got.Strategy)
	}
	if !got.FullyFulfilled() {
		t.Error("an empty order should count as fulfilled")
	}
	if got.Allocations == nil || got.Backorders == nil {
		t.Error("slices are nil; they should be empty so JSON renders []")
	}
}

func TestShipmentGroupsAreNumberedPerWarehouse(t *testing.T) {
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 4, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 2},
		{WarehouseID: east, ProductID: laptop, Available: 2},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	groups := map[int]bool{}
	for _, a := range got.Allocations {
		if a.ShipmentGroup < 1 {
			t.Errorf("allocation %+v has a non-positive shipment group", a)
		}
		groups[a.ShipmentGroup] = true
	}
	if len(groups) != got.ShipmentCount {
		t.Errorf("distinct groups = %d, ShipmentCount = %d; they must agree",
			len(groups), got.ShipmentCount)
	}
}

func TestDuplicateDemandRowsAreCombined(t *testing.T) {
	// Two quotation lines for the same product are one shipping demand.
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 2, UnitValue: d("45000")},
		{ProductID: laptop, ProductName: "Laptop", Qty: 3, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 5},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if n := allocated(got, mainWH, laptop); n != 5 {
		t.Errorf("allocated %d, want the combined 5", n)
	}
	if !got.FullyFulfilled() {
		t.Errorf("Backorders = %+v, want none", got.Backorders)
	}
}

func TestNegativeAndZeroStockIsIgnored(t *testing.T) {
	demands := []fulfillment.Demand{
		{ProductID: laptop, ProductName: "Laptop", Qty: 1, UnitValue: d("45000")},
	}
	stock := []fulfillment.Stock{
		{WarehouseID: mainWH, ProductID: laptop, Available: 0},
		{WarehouseID: east, ProductID: laptop, Available: -3},
		{WarehouseID: south, ProductID: laptop, Available: 1},
	}

	got := fulfillment.Split(demands, stock, demoWarehouses())

	if len(got.Allocations) != 1 || got.Allocations[0].WarehouseID != south {
		t.Errorf("Allocations = %+v, want a single unit from South", got.Allocations)
	}
}
