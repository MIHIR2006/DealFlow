// Package fulfillment decides which warehouses ship an order.
//
// The objective from the problem statement is to minimise the number of
// shipments, with shipping cost weighting as the tie-breaker. That ordering
// matters: a customer would rather receive one box than two, even when two
// boxes are marginally cheaper to send.
//
// The algorithm is a greedy set cover, not an optimiser. It terminates, it is
// explainable in a sentence, and its output is stable across runs — all of
// which matter more here than squeezing out the last rupee of shipping.
package fulfillment

import (
	"sort"

	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/domain/money"
)

// Strategy records how a plan was reached, for display and for audit.
type Strategy string

const (
	// StrategySingleWarehouse means one warehouse covered the whole order.
	StrategySingleWarehouse Strategy = "SINGLE_WAREHOUSE"
	// StrategyGreedySplit means the order was spread across warehouses.
	StrategyGreedySplit Strategy = "GREEDY_SPLIT"
	// StrategyNothingToShip means the order had no physical lines.
	StrategyNothingToShip Strategy = "NOTHING_TO_SHIP"
	// StrategyManualOverride means a human chose the allocation, not the engine.
	StrategyManualOverride Strategy = "MANUAL_OVERRIDE"
)

// Demand is one product the order needs shipped.
type Demand struct {
	ProductID   int64
	ProductName string
	Qty         int64

	// UnitValue weights the greedy choice so a warehouse covering the
	// expensive half of an order is preferred over one covering the cheap
	// half, when both cover the same number of units.
	UnitValue decimal.Decimal
}

// Stock is the available quantity of a product at a warehouse. Available is
// already net of reservations; this package never sees on-hand or reserved.
type Stock struct {
	WarehouseID int64
	ProductID   int64
	Available   int64
}

// Warehouse is a shipping origin.
type Warehouse struct {
	ID                 int64
	Name               string
	ShippingCostWeight decimal.Decimal
}

// Allocation is a decision to ship some quantity from a warehouse.
type Allocation struct {
	WarehouseID   int64
	WarehouseName string
	ProductID     int64
	ProductName   string
	Qty           int64

	// ShipmentGroup is 1-based and increments per warehouse, so the UI can
	// label boxes "Shipment 1 of 2".
	ShipmentGroup int
}

// Backorder is demand that no warehouse can currently satisfy. It is a normal
// outcome, not an error: the order still confirms and the shortfall is
// consolidated when stock arrives.
type Backorder struct {
	ProductID   int64
	ProductName string
	Qty         int64
}

// Plan is the proposed fulfilment for an order.
type Plan struct {
	Allocations   []Allocation
	Backorders    []Backorder
	ShipmentCount int
	EstimatedCost decimal.Decimal
	Strategy      Strategy
}

// FullyFulfilled reports whether every unit of demand was allocated.
func (p Plan) FullyFulfilled() bool { return len(p.Backorders) == 0 }

// Split builds a fulfilment plan.
//
// Inputs are copied and sorted internally, so callers may pass slices in any
// order and repeated runs produce byte-identical plans. That determinism is
// what makes the plan safe to show a customer before it is persisted.
func Split(demands []Demand, stock []Stock, warehouses []Warehouse) Plan {
	plan := Plan{
		Allocations:   []Allocation{},
		Backorders:    []Backorder{},
		EstimatedCost: money.Zero(),
		Strategy:      StrategyNothingToShip,
	}

	remaining, order := remainingDemand(demands)
	if len(order) == 0 {
		return plan
	}
	plan.Strategy = StrategyGreedySplit

	names := demandNames(demands)
	avail := availability(stock)
	whs := sortedWarehouses(warehouses)

	// Prefer a single warehouse whenever one can cover everything: fewest
	// shipments is the stated objective, and one box beats two.
	if wh, ok := singleCovering(whs, avail, remaining, order); ok {
		plan.Strategy = StrategySingleWarehouse
		plan.Allocations = allocateAll(wh, remaining, order, names, 1)
		plan.ShipmentCount = 1
		plan.EstimatedCost = money.RoundAmount(wh.ShippingCostWeight)
		return plan
	}

	used := make(map[int64]bool, len(whs))
	group := 0

	for {
		wh, ok := bestWarehouse(whs, used, avail, remaining, order, demands)
		if !ok {
			break
		}
		used[wh.ID] = true
		group++

		allocs := takeFrom(wh, avail, remaining, order, names, group)
		plan.Allocations = append(plan.Allocations, allocs...)
		plan.EstimatedCost = plan.EstimatedCost.Add(wh.ShippingCostWeight)
	}

	plan.ShipmentCount = group
	plan.EstimatedCost = money.RoundAmount(plan.EstimatedCost)
	plan.Backorders = backorders(remaining, order, names)

	return plan
}

// remainingDemand collapses duplicate product rows and returns a stable
// iteration order.
func remainingDemand(demands []Demand) (map[int64]int64, []int64) {
	remaining := make(map[int64]int64, len(demands))
	for _, d := range demands {
		if d.Qty > 0 {
			remaining[d.ProductID] += d.Qty
		}
	}

	order := make([]int64, 0, len(remaining))
	for id := range remaining {
		order = append(order, id)
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	return remaining, order
}

func demandNames(demands []Demand) map[int64]string {
	names := make(map[int64]string, len(demands))
	for _, d := range demands {
		if _, ok := names[d.ProductID]; !ok {
			names[d.ProductID] = d.ProductName
		}
	}
	return names
}

func availability(stock []Stock) map[int64]map[int64]int64 {
	avail := make(map[int64]map[int64]int64)
	for _, s := range stock {
		if s.Available <= 0 {
			continue
		}
		if avail[s.WarehouseID] == nil {
			avail[s.WarehouseID] = make(map[int64]int64)
		}
		avail[s.WarehouseID][s.ProductID] += s.Available
	}
	return avail
}

// sortedWarehouses orders by shipping cost, then id, so ties resolve the same
// way every time.
func sortedWarehouses(warehouses []Warehouse) []Warehouse {
	out := make([]Warehouse, len(warehouses))
	copy(out, warehouses)
	sort.Slice(out, func(i, j int) bool {
		if c := out[i].ShippingCostWeight.Cmp(out[j].ShippingCostWeight); c != 0 {
			return c < 0
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func singleCovering(
	whs []Warehouse, avail map[int64]map[int64]int64,
	remaining map[int64]int64, order []int64,
) (Warehouse, bool) {
	for _, wh := range whs {
		stock := avail[wh.ID]
		covers := true
		for _, pid := range order {
			if stock[pid] < remaining[pid] {
				covers = false
				break
			}
		}
		if covers {
			return wh, true
		}
	}
	return Warehouse{}, false
}

func allocateAll(
	wh Warehouse, remaining map[int64]int64, order []int64,
	names map[int64]string, group int,
) []Allocation {
	out := make([]Allocation, 0, len(order))
	for _, pid := range order {
		qty := remaining[pid]
		if qty <= 0 {
			continue
		}
		out = append(out, Allocation{
			WarehouseID: wh.ID, WarehouseName: wh.Name,
			ProductID: pid, ProductName: names[pid],
			Qty: qty, ShipmentGroup: group,
		})
		remaining[pid] = 0
	}
	return out
}

// bestWarehouse picks the unused warehouse covering the most remaining demand
// by value, breaking ties on shipping cost and then id.
func bestWarehouse(
	whs []Warehouse, used map[int64]bool, avail map[int64]map[int64]int64,
	remaining map[int64]int64, order []int64, demands []Demand,
) (Warehouse, bool) {
	unit := unitValues(demands)

	var best Warehouse
	bestValue := money.Zero()
	found := false

	for _, wh := range whs {
		if used[wh.ID] {
			continue
		}
		stock := avail[wh.ID]
		if stock == nil {
			continue
		}

		coverage := money.Zero()
		for _, pid := range order {
			take := minInt64(remaining[pid], stock[pid])
			if take > 0 {
				coverage = coverage.Add(unit[pid].Mul(decimal.NewFromInt(take)))
			}
		}

		if coverage.IsZero() {
			continue
		}
		// whs is already sorted by cost then id, so a strict greater-than
		// keeps the first (cheapest, lowest id) warehouse on a tie.
		if !found || coverage.GreaterThan(bestValue) {
			best, bestValue, found = wh, coverage, true
		}
	}

	return best, found
}

func unitValues(demands []Demand) map[int64]decimal.Decimal {
	unit := make(map[int64]decimal.Decimal, len(demands))
	for _, d := range demands {
		if _, ok := unit[d.ProductID]; !ok {
			unit[d.ProductID] = d.UnitValue
		}
	}
	return unit
}

func takeFrom(
	wh Warehouse, avail map[int64]map[int64]int64,
	remaining map[int64]int64, order []int64,
	names map[int64]string, group int,
) []Allocation {
	stock := avail[wh.ID]
	out := make([]Allocation, 0, len(order))

	for _, pid := range order {
		take := minInt64(remaining[pid], stock[pid])
		if take <= 0 {
			continue
		}
		out = append(out, Allocation{
			WarehouseID: wh.ID, WarehouseName: wh.Name,
			ProductID: pid, ProductName: names[pid],
			Qty: take, ShipmentGroup: group,
		})
		remaining[pid] -= take
		stock[pid] -= take
	}
	return out
}

func backorders(remaining map[int64]int64, order []int64, names map[int64]string) []Backorder {
	out := []Backorder{}
	for _, pid := range order {
		if qty := remaining[pid]; qty > 0 {
			out = append(out, Backorder{ProductID: pid, ProductName: names[pid], Qty: qty})
		}
	}
	return out
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// OverrideLine is one caller-specified allocation, used when a rep or
// finance reviewer overrules the engine's suggested split.
type OverrideLine struct {
	WarehouseID int64
	ProductID   int64
	Qty         int64
}

// OverrideStockShortfall names one override entry that asked a warehouse for
// more than it currently has available.
type OverrideStockShortfall struct {
	WarehouseID int64
	ProductID   int64
	Requested   int64
	Available   int64
}

// OverrideResult is what applying manual overrides produced.
//
// The two problem fields are kept separate rather than folded into one error
// because they mean different things to a caller: asking a warehouse for
// more than it has is a conflict with the current state of the world (stock
// may have moved since the split was suggested), while asking for more of a
// product than the order itself needs is simply a malformed request. Callers
// map the two to different HTTP statuses.
type OverrideResult struct {
	Plan          Plan
	ExceedsDemand []int64
	ExceedsStock  []OverrideStockShortfall
}

// Override builds a plan from caller-specified allocations instead of
// running the greedy engine. A manual split is allowed to leave some demand
// unfulfilled — it becomes a backorder just as an engine-chosen split would —
// but it is never allowed to invent units a warehouse does not have, or ship
// more of a product than the order asked for.
func Override(demands []Demand, stock []Stock, warehouses []Warehouse, lines []OverrideLine) OverrideResult {
	var result OverrideResult

	totalDemand, order := remainingDemand(demands)
	if len(order) == 0 {
		result.Plan = Plan{Allocations: []Allocation{}, Backorders: []Backorder{}, EstimatedCost: money.Zero(), Strategy: StrategyNothingToShip}
		return result
	}

	// Pass 1: the request must not ask for more of a product, in total, than
	// the order needs — independent of what any single warehouse holds.
	requestedByProduct := make(map[int64]int64, len(order))
	for _, l := range lines {
		if l.Qty > 0 {
			requestedByProduct[l.ProductID] += l.Qty
		}
	}
	for pid, requested := range requestedByProduct {
		if requested > totalDemand[pid] {
			result.ExceedsDemand = append(result.ExceedsDemand, pid)
		}
	}
	if len(result.ExceedsDemand) > 0 {
		sort.Slice(result.ExceedsDemand, func(i, j int) bool { return result.ExceedsDemand[i] < result.ExceedsDemand[j] })
		return result
	}

	// Pass 2: each individual allocation must not ask a warehouse for more
	// than it currently has. Shipment groups are assigned per warehouse, in
	// the order the caller's lines first mention one, so "Shipment 1" is
	// whichever warehouse the override led with.
	names := demandNames(demands)
	whNames := make(map[int64]string, len(warehouses))
	whByID := make(map[int64]Warehouse, len(warehouses))
	for _, w := range warehouses {
		whNames[w.ID] = w.Name
		whByID[w.ID] = w
	}
	avail := availability(stock)
	remaining := make(map[int64]int64, len(totalDemand))
	for pid, qty := range totalDemand {
		remaining[pid] = qty
	}

	plan := Plan{Allocations: []Allocation{}, Backorders: []Backorder{}}
	groupByWarehouse := make(map[int64]int)
	nextGroup := 1

	for _, l := range lines {
		if l.Qty <= 0 {
			continue
		}
		var available int64
		if wm := avail[l.WarehouseID]; wm != nil {
			available = wm[l.ProductID]
		}
		if l.Qty > available {
			result.ExceedsStock = append(result.ExceedsStock, OverrideStockShortfall{
				WarehouseID: l.WarehouseID, ProductID: l.ProductID,
				Requested: l.Qty, Available: available,
			})
			continue
		}

		group, ok := groupByWarehouse[l.WarehouseID]
		if !ok {
			group = nextGroup
			groupByWarehouse[l.WarehouseID] = group
			nextGroup++
		}

		plan.Allocations = append(plan.Allocations, Allocation{
			WarehouseID: l.WarehouseID, WarehouseName: whNames[l.WarehouseID],
			ProductID: l.ProductID, ProductName: names[l.ProductID],
			Qty: l.Qty, ShipmentGroup: group,
		})
		remaining[l.ProductID] -= l.Qty
		avail[l.WarehouseID][l.ProductID] -= l.Qty
	}
	if len(result.ExceedsStock) > 0 {
		return result
	}

	plan.Backorders = backorders(remaining, order, names)
	plan.ShipmentCount = nextGroup - 1
	plan.Strategy = StrategyManualOverride

	cost := money.Zero()
	for whID := range groupByWarehouse {
		cost = cost.Add(whByID[whID].ShippingCostWeight)
	}
	plan.EstimatedCost = money.RoundAmount(cost)

	result.Plan = plan
	return result
}
