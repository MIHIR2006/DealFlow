package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// FulfillmentService turns an approved quotation into an order and decides
// where its stock ships from.
//
// The engine that picks warehouses is pure and lives in domain/fulfillment.
// What lives here is everything that makes its answer safe to act on: the
// stock it planned against is locked for the duration, the reservation
// happens in the same transaction as the plan, and anything unavailable
// becomes a backorder rather than an error.
type FulfillmentService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewFulfillmentService builds the service.
func NewFulfillmentService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *FulfillmentService {
	return &FulfillmentService{pool: pool, q: q, quote: quote}
}

// DefaultPromiseDays is how far out an order is promised when the caller does
// not say. It drives the delivery-slippage alert on the dashboard.
const DefaultPromiseDays = 7

// Order is a sales order with its fulfilment plan.
type Order struct {
	Header     sqlcgen.GetSalesOrderRow
	Lines      []sqlcgen.ListFulfillmentLinesRow
	Backorders []sqlcgen.ListOpenBackordersRow

	// Plan is present on a suggestion, where nothing has been persisted yet.
	Plan *fulfillment.Plan

	Fulfillment *sqlcgen.Fulfillment
}

// Confirm turns an approved quotation into a sales order.
func (s *FulfillmentService) Confirm(ctx context.Context, actor auth.Principal, quotationID int64, promised *time.Time) (Order, error) {
	quote, err := s.quote.Get(ctx, actor, quotationID)
	if err != nil {
		return Order{}, err
	}

	// Only a quotation that has cleared governance may become an order. SENT
	// is included because a customer confirming from the portal has already
	// been through the chain.
	switch quote.Header.Status {
	case "APPROVED", "SENT", "UNDER_NEGOTIATION":
	case "CONFIRMED":
		return Order{}, apierr.Conflict("this quotation is already confirmed")
	default:
		return Order{}, apierr.Conflict(
			fmt.Sprintf("a quotation in %s cannot be confirmed; it must be approved first",
				quote.Header.Status))
	}

	promisedAt := time.Now().AddDate(0, 0, DefaultPromiseDays)
	if promised != nil {
		promisedAt = *promised
	}

	ref, err := s.q.NextSalesOrderReference(ctx)
	if err != nil {
		return Order{}, apierr.Internal(fmt.Errorf("next order reference: %w", err))
	}

	var orderID int64
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		order, err := qtx.CreateSalesOrder(ctx, sqlcgen.CreateSalesOrderParams{
			Reference:    ref,
			QuotationID:  quotationID,
			CustomerID:   quote.Header.CustomerID,
			PromisedDate: &promisedAt,
		})
		if err != nil {
			if isUniqueViolation(err) {
				return apierr.Conflict("this quotation already has an order")
			}
			return fmt.Errorf("create sales order: %w", err)
		}
		orderID = order.ID

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: quotationID, Status: "CONFIRMED",
		}); err != nil {
			return fmt.Errorf("update quotation status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	s.audit(ctx, quotationID, "CONFIRMED", actor,
		fmt.Sprintf("Confirmed as order %s, promised %s", ref, promisedAt.Format("2006-01-02")),
		map[string]any{"sales_order_id": orderID, "reference": ref})

	return s.Get(ctx, actor, orderID)
}

// Get returns an order with whatever fulfilment has been recorded for it.
func (s *FulfillmentService) Get(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	header, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Order{}, apierr.NotFound("order not found")
		}
		return Order{}, apierr.Internal(fmt.Errorf("get order: %w", err))
	}
	if err := s.authoriseOrder(ctx, actor, header.QuotationID); err != nil {
		return Order{}, err
	}

	out := Order{Header: header}

	plan, err := s.q.GetFulfillmentForOrder(ctx, orderID)
	switch {
	case err == nil:
		out.Fulfillment = &plan
		lines, err := s.q.ListFulfillmentLines(ctx, plan.ID)
		if err != nil {
			return Order{}, apierr.Internal(fmt.Errorf("list fulfillment lines: %w", err))
		}
		out.Lines = lines
	case errors.Is(err, pgx.ErrNoRows):
		out.Lines = []sqlcgen.ListFulfillmentLinesRow{}
	default:
		return Order{}, apierr.Internal(fmt.Errorf("get fulfillment: %w", err))
	}

	backorders, err := s.q.ListOpenBackorders(ctx, orderID)
	if err != nil {
		return Order{}, apierr.Internal(fmt.Errorf("list backorders: %w", err))
	}
	out.Backorders = backorders

	return out, nil
}

// authoriseOrder reuses the quotation's visibility rules: whoever may see the
// deal may see the order it became.
func (s *FulfillmentService) authoriseOrder(ctx context.Context, actor auth.Principal, quotationID int64) error {
	if _, err := s.quote.Get(ctx, actor, quotationID); err != nil {
		return err
	}
	return nil
}

// Suggest runs the split engine and returns the plan without persisting it.
//
// The rep sees where the order would ship from before committing to it, which
// is what makes the manual override meaningful.
func (s *FulfillmentService) Suggest(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	order, err := s.Get(ctx, actor, orderID)
	if err != nil {
		return Order{}, err
	}

	demands, productIDs, err := s.demandFor(ctx, orderID)
	if err != nil {
		return Order{}, err
	}
	if len(demands) == 0 {
		empty := fulfillment.Split(nil, nil, nil)
		order.Plan = &empty
		return order, nil
	}

	rows, err := s.q.GetStockForProducts(ctx, productIDs)
	if err != nil {
		return Order{}, apierr.Internal(fmt.Errorf("read stock: %w", err))
	}

	stock, warehouses := stockFromRows(rows)
	plan := fulfillment.Split(demands, stock, warehouses)
	order.Plan = &plan

	return order, nil
}

// Override is a caller-supplied allocation replacing the engine's suggestion.
type Override struct {
	WarehouseID int64
	ProductID   int64
	Qty         int64
}

// AcceptInput records a fulfilment plan.
type AcceptInput struct {
	OrderID   int64
	Overrides []Override
}

// Accept reserves stock and records the fulfilment.
//
// Plan and reservation happen inside one transaction over locked stock rows,
// so the warehouses the engine chose are the warehouses the order actually
// takes from. Two orders racing for the last unit queue on the lock; the
// second one plans against what is genuinely left and backorders the rest.
func (s *FulfillmentService) Accept(ctx context.Context, actor auth.Principal, in AcceptInput) (Order, error) {
	order, err := s.Get(ctx, actor, in.OrderID)
	if err != nil {
		return Order{}, err
	}

	// Recording a second plan would reserve the same stock twice.
	if order.Fulfillment != nil {
		return Order{}, apierr.Conflict("this order already has a fulfilment plan")
	}

	demands, productIDs, err := s.demandFor(ctx, in.OrderID)
	if err != nil {
		return Order{}, err
	}
	if len(demands) == 0 {
		return Order{}, apierr.Validation("this order has nothing to ship")
	}

	var plan fulfillment.Plan

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		locked, err := qtx.LockStockForProducts(ctx, productIDs)
		if err != nil {
			return fmt.Errorf("lock stock: %w", err)
		}
		stock, warehouses := stockFromLocked(locked)

		if len(in.Overrides) > 0 {
			plan, err = planFromOverrides(demands, stock, warehouses, in.Overrides)
			if err != nil {
				return err
			}
		} else {
			plan = fulfillment.Split(demands, stock, warehouses)
		}

		fulfilmentRow, err := qtx.CreateFulfillment(ctx, sqlcgen.CreateFulfillmentParams{
			SalesOrderID: in.OrderID,
			Strategy:     string(plan.Strategy),
			// Shipments, not allocations: two products leaving one warehouse
			// travel in one box.
			ShipmentCount:    shipmentCount(plan.ShipmentCount),
			EstimatedCost:    plan.EstimatedCost,
			IsManualOverride: len(in.Overrides) > 0,
		})
		if err != nil {
			return fmt.Errorf("create fulfillment: %w", err)
		}

		// Reserve before writing the lines, so a shortfall that slipped past
		// the plan aborts the whole transaction rather than recording a
		// shipment that cannot happen.
		for _, a := range plan.Allocations {
			if _, err := qtx.ReserveStock(ctx, sqlcgen.ReserveStockParams{
				WarehouseID: a.WarehouseID, ProductID: a.ProductID, Qty: a.Qty,
			}); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return apierr.Conflict(fmt.Sprintf(
						"stock for product %d at warehouse %d changed while planning; retry",
						a.ProductID, a.WarehouseID))
				}
				return fmt.Errorf("reserve stock: %w", err)
			}
		}

		rows := make([]sqlcgen.InsertFulfillmentLinesParams, 0, len(plan.Allocations))
		for _, a := range plan.Allocations {
			rows = append(rows, sqlcgen.InsertFulfillmentLinesParams{
				FulfillmentID: fulfilmentRow.ID,
				WarehouseID:   a.WarehouseID,
				ProductID:     a.ProductID,
				Qty:           a.Qty,
				ShipmentGroup: shipmentCount(a.ShipmentGroup),
			})
		}
		if len(rows) > 0 {
			if _, err := qtx.InsertFulfillmentLines(ctx, rows); err != nil {
				return fmt.Errorf("insert fulfillment lines: %w", err)
			}
		}

		// A shortfall is a normal outcome, not a failure: the order still
		// stands and the remainder is consolidated when stock arrives.
		for _, b := range plan.Backorders {
			if _, err := qtx.CreateBackorder(ctx, sqlcgen.CreateBackorderParams{
				SalesOrderID: in.OrderID, ProductID: b.ProductID, Qty: b.Qty,
			}); err != nil {
				return fmt.Errorf("create backorder: %w", err)
			}
		}

		status := "FULFILLED"
		if len(plan.Backorders) > 0 {
			status = "PARTIALLY_FULFILLED"
		}
		if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
			ID: in.OrderID, Status: status,
		}); err != nil {
			return fmt.Errorf("update order status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	note := fmt.Sprintf("Fulfilment accepted: %d shipment(s) via %s",
		plan.ShipmentCount, plan.Strategy)
	if len(plan.Backorders) > 0 {
		note += fmt.Sprintf(", %d line(s) backordered", len(plan.Backorders))
	}
	s.audit(ctx, order.Header.QuotationID, "FULFILMENT_PLANNED", actor, note, map[string]any{
		"sales_order_id":  in.OrderID,
		"strategy":        string(plan.Strategy),
		"shipment_count":  plan.ShipmentCount,
		"backorder_count": len(plan.Backorders),
		"manual_override": len(in.Overrides) > 0,
	})

	return s.Get(ctx, actor, in.OrderID)
}

// Consolidate fulfils backorders whose stock has since arrived.
//
// This is the "stock arrived, consolidate?" prompt: the shortfall is shipped
// as an additional group on the existing plan rather than as a new order.
func (s *FulfillmentService) Consolidate(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	order, err := s.Get(ctx, actor, orderID)
	if err != nil {
		return Order{}, err
	}
	if order.Fulfillment == nil {
		return Order{}, apierr.Conflict("this order has no fulfilment plan to consolidate into")
	}

	ready, err := s.q.ListConsolidatableBackorders(ctx, orderID)
	if err != nil {
		return Order{}, apierr.Internal(fmt.Errorf("list consolidatable backorders: %w", err))
	}
	if len(ready) == 0 {
		return Order{}, apierr.Conflict("no backordered line has enough stock to consolidate yet")
	}

	var resolved int
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		productIDs := make([]int64, 0, len(ready))
		for _, b := range ready {
			productIDs = append(productIDs, b.ProductID)
		}

		locked, err := qtx.LockStockForProducts(ctx, productIDs)
		if err != nil {
			return fmt.Errorf("lock stock: %w", err)
		}
		stock, warehouses := stockFromLocked(locked)

		demands := make([]fulfillment.Demand, 0, len(ready))
		for _, b := range ready {
			demands = append(demands, fulfillment.Demand{
				ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty,
			})
		}

		plan := fulfillment.Split(demands, stock, warehouses)
		if len(plan.Allocations) == 0 {
			return apierr.Conflict("the stock was taken before this consolidation ran")
		}

		// The consolidated shipment continues the numbering of the original
		// plan, so the order reads as one delivery in parts.
		base := order.Fulfillment.ShipmentCount

		rows := make([]sqlcgen.InsertFulfillmentLinesParams, 0, len(plan.Allocations))
		for _, a := range plan.Allocations {
			if _, err := qtx.ReserveStock(ctx, sqlcgen.ReserveStockParams{
				WarehouseID: a.WarehouseID, ProductID: a.ProductID, Qty: a.Qty,
			}); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return apierr.Conflict("the stock was taken before this consolidation ran")
				}
				return fmt.Errorf("reserve stock: %w", err)
			}
			rows = append(rows, sqlcgen.InsertFulfillmentLinesParams{
				FulfillmentID: order.Fulfillment.ID,
				WarehouseID:   a.WarehouseID,
				ProductID:     a.ProductID,
				Qty:           a.Qty,
				ShipmentGroup: base + shipmentCount(a.ShipmentGroup),
			})
		}
		if _, err := qtx.InsertFulfillmentLines(ctx, rows); err != nil {
			return fmt.Errorf("insert fulfillment lines: %w", err)
		}

		// Only fully covered backorders close. A partially covered one stays
		// open for the next arrival.
		fulfilled := map[int64]int64{}
		for _, a := range plan.Allocations {
			fulfilled[a.ProductID] += a.Qty
		}
		for _, b := range ready {
			if fulfilled[b.ProductID] < b.Qty {
				continue
			}
			if _, err := qtx.ResolveBackorder(ctx, b.ID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("resolve backorder: %w", err)
			}
			resolved++
		}

		remaining, err := qtx.ListOpenBackorders(ctx, orderID)
		if err != nil {
			return fmt.Errorf("list open backorders: %w", err)
		}
		status := "FULFILLED"
		if len(remaining) > 0 {
			status = "PARTIALLY_FULFILLED"
		}
		if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
			ID: orderID, Status: status,
		}); err != nil {
			return fmt.Errorf("update order status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	s.audit(ctx, order.Header.QuotationID, "BACKORDER_CONSOLIDATED", actor,
		fmt.Sprintf("Consolidated %d backordered line(s) after stock arrived", resolved),
		map[string]any{"sales_order_id": orderID, "resolved": resolved})

	return s.Get(ctx, actor, orderID)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// demandFor collects the physical demand of an order.
func (s *FulfillmentService) demandFor(ctx context.Context, orderID int64) ([]fulfillment.Demand, []int64, error) {
	lines, err := s.q.ListFulfillableLines(ctx, orderID)
	if err != nil {
		return nil, nil, apierr.Internal(fmt.Errorf("list fulfillable lines: %w", err))
	}

	demands := make([]fulfillment.Demand, 0, len(lines))
	ids := make([]int64, 0, len(lines))
	seen := map[int64]bool{}

	for _, l := range lines {
		demands = append(demands, fulfillment.Demand{
			ProductID:   l.ProductID,
			ProductName: l.ProductName,
			Qty:         l.Qty.IntPart(),
			UnitValue:   l.UnitPrice,
		})
		if !seen[l.ProductID] {
			ids = append(ids, l.ProductID)
			seen[l.ProductID] = true
		}
	}
	return demands, ids, nil
}

func stockFromRows(rows []sqlcgen.GetStockForProductsRow) ([]fulfillment.Stock, []fulfillment.Warehouse) {
	stock := make([]fulfillment.Stock, 0, len(rows))
	seen := map[int64]bool{}
	warehouses := make([]fulfillment.Warehouse, 0, 4)

	for _, r := range rows {
		stock = append(stock, fulfillment.Stock{
			WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
		})
		if !seen[r.WarehouseID] {
			warehouses = append(warehouses, fulfillment.Warehouse{
				ID: r.WarehouseID, Name: r.WarehouseName,
				ShippingCostWeight: r.ShippingCostWeight,
			})
			seen[r.WarehouseID] = true
		}
	}
	return stock, warehouses
}

func stockFromLocked(rows []sqlcgen.LockStockForProductsRow) ([]fulfillment.Stock, []fulfillment.Warehouse) {
	stock := make([]fulfillment.Stock, 0, len(rows))
	seen := map[int64]bool{}
	warehouses := make([]fulfillment.Warehouse, 0, 4)

	for _, r := range rows {
		stock = append(stock, fulfillment.Stock{
			WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
		})
		if !seen[r.WarehouseID] {
			warehouses = append(warehouses, fulfillment.Warehouse{
				ID: r.WarehouseID, Name: r.WarehouseName,
				ShippingCostWeight: r.ShippingCostWeight,
			})
			seen[r.WarehouseID] = true
		}
	}
	return stock, warehouses
}

// planFromOverrides validates a caller-supplied allocation and turns it into
// a plan.
//
// An override is a human overruling the engine, not a licence to promise
// stock that is not there: each allocation is checked against what the
// locked rows actually hold, and anything the override leaves uncovered
// becomes a backorder just as it would have done automatically.
func planFromOverrides(
	demands []fulfillment.Demand,
	stock []fulfillment.Stock,
	warehouses []fulfillment.Warehouse,
	overrides []Override,
) (fulfillment.Plan, error) {
	available := map[int64]map[int64]int64{}
	for _, s := range stock {
		if available[s.WarehouseID] == nil {
			available[s.WarehouseID] = map[int64]int64{}
		}
		available[s.WarehouseID][s.ProductID] = s.Available
	}

	remaining := map[int64]int64{}
	names := map[int64]string{}
	for _, d := range demands {
		remaining[d.ProductID] += d.Qty
		names[d.ProductID] = d.ProductName
	}

	whName := map[int64]string{}
	for _, w := range warehouses {
		whName[w.ID] = w.Name
	}

	plan := fulfillment.Plan{
		Allocations: []fulfillment.Allocation{},
		Backorders:  []fulfillment.Backorder{},
		Strategy:    fulfillment.StrategyGreedySplit,
	}

	groups := map[int64]int{}
	for _, o := range overrides {
		if o.Qty <= 0 {
			return plan, apierr.Validation("every override quantity must be positive")
		}
		if _, ok := remaining[o.ProductID]; !ok {
			return plan, apierr.Validation(
				fmt.Sprintf("product %d is not on this order", o.ProductID))
		}
		if o.Qty > remaining[o.ProductID] {
			return plan, apierr.Validation(fmt.Sprintf(
				"override allocates %d of product %d but only %d remain unallocated",
				o.Qty, o.ProductID, remaining[o.ProductID]))
		}
		if have := available[o.WarehouseID][o.ProductID]; o.Qty > have {
			return plan, apierr.Conflict(fmt.Sprintf(
				"warehouse %d has %d of product %d available, not %d",
				o.WarehouseID, have, o.ProductID, o.Qty))
		}

		group, ok := groups[o.WarehouseID]
		if !ok {
			group = len(groups) + 1
			groups[o.WarehouseID] = group
		}

		plan.Allocations = append(plan.Allocations, fulfillment.Allocation{
			WarehouseID: o.WarehouseID, WarehouseName: whName[o.WarehouseID],
			ProductID: o.ProductID, ProductName: names[o.ProductID],
			Qty: o.Qty, ShipmentGroup: group,
		})

		remaining[o.ProductID] -= o.Qty
		available[o.WarehouseID][o.ProductID] -= o.Qty
	}

	for _, d := range demands {
		if qty := remaining[d.ProductID]; qty > 0 {
			plan.Backorders = append(plan.Backorders, fulfillment.Backorder{
				ProductID: d.ProductID, ProductName: d.ProductName, Qty: qty,
			})
			remaining[d.ProductID] = 0
		}
	}

	plan.ShipmentCount = len(groups)
	if plan.ShipmentCount == 1 {
		plan.Strategy = fulfillment.StrategySingleWarehouse
	}
	for id := range groups {
		for _, w := range warehouses {
			if w.ID == id {
				plan.EstimatedCost = plan.EstimatedCost.Add(w.ShippingCostWeight)
			}
		}
	}
	return plan, nil
}

// shipmentCount narrows a shipment count or group number for storage.
//
// These are bounded by the number of active warehouses, so the ceiling is
// unreachable in practice; clamping rather than truncating means that if the
// assumption ever breaks, the value saturates instead of wrapping to a
// negative shipment number.
func shipmentCount(n int) int32 {
	switch {
	case n < 0:
		return 0
	case n > math.MaxInt32:
		return math.MaxInt32
	default:
		return int32(n)
	}
}

func (s *FulfillmentService) audit(ctx context.Context, quotationID int64, action string, actor auth.Principal, note string, payload map[string]any) {
	encoded := []byte("{}")
	if payload != nil {
		if b, err := json.Marshal(payload); err == nil {
			encoded = b
		}
	}

	actorID := actor.UserID
	_, _ = s.q.AppendAuditLog(ctx, sqlcgen.AppendAuditLogParams{
		EntityType: "quotation",
		EntityID:   quotationID,
		Action:     action,
		ActorID:    &actorID,
		ActorLabel: actor.Email,
		Note:       note,
		Payload:    encoded,
	})
}
