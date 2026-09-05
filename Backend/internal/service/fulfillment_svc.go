package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// FulfillmentService turns a confirmed quotation into a sales order and
// decides which warehouses ship it.
//
// Suggesting a plan is free and persists nothing, so a rep can preview the
// split before committing to it. Accepting one locks the stock rows,
// reserves exactly what the plan allocates, and records any shortfall as a
// backorder — all inside one transaction, so a plan shown to a rep is the
// plan that gets reserved even under concurrent orders.
type FulfillmentService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewFulfillmentService builds the service.
func NewFulfillmentService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *FulfillmentService {
	return &FulfillmentService{pool: pool, q: q, quote: quote}
}

// Order is a sales order with its fulfilment state and any open backorders.
type Order struct {
	Header      sqlcgen.GetSalesOrderRow
	Fulfillment *sqlcgen.Fulfillment
	Lines       []sqlcgen.ListFulfillmentLinesRow
	Backorders  []sqlcgen.ListOpenBackordersRow
}

// Confirm closes a deal into a sales order.
//
// It accepts a quotation a staff member is closing directly (APPROVED) as
// well as one a customer already confirmed through the portal (CONFIRMED);
// the portal is an optional negotiation step, not a requirement to place an
// order. It is safe to call more than once: a second call returns the order
// already created rather than erroring, so a retried request cannot create
// two orders for the same quotation.
func (s *FulfillmentService) Confirm(ctx context.Context, actor auth.Principal, quotationID int64, promisedDate *time.Time) (Order, error) {
	quote, err := s.quote.Get(ctx, actor, quotationID)
	if err != nil {
		return Order{}, err
	}

	if existing, err := s.q.GetSalesOrderByQuotation(ctx, quotationID); err == nil {
		return s.Get(ctx, actor, existing.ID)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Order{}, apierr.Internal(fmt.Errorf("get sales order by quotation: %w", err))
	}

	switch quote.Header.Status {
	case "APPROVED", "CONFIRMED":
	default:
		return Order{}, apierr.Conflict(fmt.Sprintf(
			"a quotation in %s cannot become an order; it must be approved first", quote.Header.Status))
	}

	var order sqlcgen.SalesOrder
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if quote.Header.Status != "CONFIRMED" {
			if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
				ID: quotationID, Status: "CONFIRMED",
			}); err != nil {
				return fmt.Errorf("update quotation status: %w", err)
			}
		}

		ref, err := qtx.NextSalesOrderReference(ctx)
		if err != nil {
			return fmt.Errorf("next sales order reference: %w", err)
		}

		created, err := qtx.CreateSalesOrder(ctx, sqlcgen.CreateSalesOrderParams{
			Reference: ref, QuotationID: quotationID, CustomerID: quote.Header.CustomerID,
			PromisedDate: promisedDate,
		})
		if err != nil {
			return fmt.Errorf("create sales order: %w", err)
		}
		order = created
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	if quote.Header.Status != "CONFIRMED" {
		s.quote.audit(ctx, quotationID, "CONFIRMED", actor, "Deal closed by staff", nil)
	}
	s.quote.Audit(ctx, quotationID, "ORDER_CREATED", actor,
		fmt.Sprintf("Sales order %s opened", order.Reference), map[string]any{"sales_order_id": order.ID})

	return s.Get(ctx, actor, order.ID)
}

// Get loads an order, its most recent fulfilment, and any open backorders.
func (s *FulfillmentService) Get(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	header, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Order{}, apierr.NotFound("order not found")
		}
		return Order{}, apierr.Internal(fmt.Errorf("get sales order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, header.QuotationID); err != nil {
		return Order{}, err
	}

	out := Order{Header: header}

	f, err := s.q.GetFulfillmentForOrder(ctx, orderID)
	switch {
	case err == nil:
		out.Fulfillment = &f
		lines, err := s.q.ListFulfillmentLines(ctx, f.ID)
		if err != nil {
			return Order{}, apierr.Internal(fmt.Errorf("list fulfillment lines: %w", err))
		}
		out.Lines = lines
	case errors.Is(err, pgx.ErrNoRows):
		// Not yet fulfilled; that is a normal state, not an error.
	default:
		return Order{}, apierr.Internal(fmt.Errorf("get fulfillment for order: %w", err))
	}

	backorders, err := s.q.ListOpenBackorders(ctx, orderID)
	if err != nil {
		return Order{}, apierr.Internal(fmt.Errorf("list open backorders: %w", err))
	}
	out.Backorders = backorders

	return out, nil
}

// OrderSummary is a lightweight view of a sales order for listings.
type OrderSummary struct {
	ID                 int64
	Reference          string
	QuotationID        int64
	QuotationReference string
	CustomerID         int64
	CustomerName       string
	Status             string
	PromisedDate       *time.Time
	ConfirmedAt        *time.Time
	CreatedAt          time.Time
	ShipmentCount      int64
	BackorderCount     int64
}

// List returns all sales orders ordered newest first.
func (s *FulfillmentService) List(ctx context.Context, actor auth.Principal, limit int32) ([]OrderSummary, error) {
	const query = `
		SELECT so.id, so.reference, so.quotation_id, so.customer_id, so.status,
		       so.promised_date, so.confirmed_at, so.created_at,
		       q.reference AS quotation_reference, c.name AS customer_name,
		       COALESCE(f.shipment_count, 0) AS shipment_count,
		       COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'OPEN') AS backorder_count
		FROM sales_orders so
		JOIN quotations q ON q.id = so.quotation_id
		JOIN customers  c ON c.id = so.customer_id
		LEFT JOIN fulfillments f ON f.sales_order_id = so.id
		LEFT JOIN backorders   b ON b.sales_order_id = so.id
		GROUP BY so.id, q.reference, c.name, f.shipment_count
		ORDER BY so.id DESC
		LIMIT $1`
	rows, err := s.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list sales orders: %w", err))
	}
	defer rows.Close()

	var out []OrderSummary
	for rows.Next() {
		var o OrderSummary
		if err := rows.Scan(
			&o.ID, &o.Reference, &o.QuotationID, &o.CustomerID, &o.Status,
			&o.PromisedDate, &o.ConfirmedAt, &o.CreatedAt,
			&o.QuotationReference, &o.CustomerName,
			&o.ShipmentCount, &o.BackorderCount,
		); err != nil {
			return nil, apierr.Internal(fmt.Errorf("scan sales order: %w", err))
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// buildPlan loads demand, stock, and warehouses for an order and runs the
// split engine. Called both by Suggest, which never writes, and by Accept,
// which re-runs it against locked rows so the reservation matches exactly
// what was shown.
func (s *FulfillmentService) buildPlan(ctx context.Context, q *sqlcgen.Queries, orderID int64, locked bool) (fulfillment.Plan, error) {
	lines, err := q.ListFulfillableLines(ctx, orderID)
	if err != nil {
		return fulfillment.Plan{}, apierr.Internal(fmt.Errorf("list fulfillable lines: %w", err))
	}
	if len(lines) == 0 {
		return fulfillment.Split(nil, nil, nil), nil
	}

	productIDs := make([]int64, 0, len(lines))
	demands := make([]fulfillment.Demand, 0, len(lines))
	for _, l := range lines {
		productIDs = append(productIDs, l.ProductID)
		demands = append(demands, fulfillment.Demand{
			ProductID: l.ProductID, ProductName: l.ProductName,
			Qty: l.Qty.IntPart(), UnitValue: l.UnitPrice,
		})
	}

	warehouseRows, err := q.ListWarehouses(ctx)
	if err != nil {
		return fulfillment.Plan{}, apierr.Internal(fmt.Errorf("list warehouses: %w", err))
	}
	warehouses := make([]fulfillment.Warehouse, 0, len(warehouseRows))
	for _, w := range warehouseRows {
		warehouses = append(warehouses, fulfillment.Warehouse{
			ID: w.ID, Name: w.Name, ShippingCostWeight: w.ShippingCostWeight,
		})
	}

	stock := make([]fulfillment.Stock, 0)
	if locked {
		rows, err := q.LockStockForProducts(ctx, productIDs)
		if err != nil {
			return fulfillment.Plan{}, apierr.Internal(fmt.Errorf("lock stock for products: %w", err))
		}
		for _, r := range rows {
			stock = append(stock, fulfillment.Stock{
				WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
			})
		}
	} else {
		rows, err := q.GetStockForProducts(ctx, productIDs)
		if err != nil {
			return fulfillment.Plan{}, apierr.Internal(fmt.Errorf("get stock for products: %w", err))
		}
		for _, r := range rows {
			stock = append(stock, fulfillment.Stock{
				WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
			})
		}
	}

	return fulfillment.Split(demands, stock, warehouses), nil
}

// Suggest previews the fulfilment plan for an order without persisting
// anything.
func (s *FulfillmentService) Suggest(ctx context.Context, actor auth.Principal, orderID int64) (fulfillment.Plan, error) {
	header, err := s.q.GetSalesOrder(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fulfillment.Plan{}, apierr.NotFound("order not found")
		}
		return fulfillment.Plan{}, apierr.Internal(fmt.Errorf("get sales order: %w", err))
	}
	if _, err := s.quote.Get(ctx, actor, header.QuotationID); err != nil {
		return fulfillment.Plan{}, err
	}

	return s.buildPlan(ctx, s.q, orderID, false)
}

// Accept re-runs the split against locked stock and reserves exactly what it
// allocates. An order can be accepted only once; consolidating a later
// backorder is a separate, additive step.
func (s *FulfillmentService) Accept(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	order, err := s.Get(ctx, actor, orderID)
	if err != nil {
		return Order{}, err
	}
	if order.Fulfillment != nil {
		return Order{}, apierr.Conflict("this order has already been fulfilled")
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		plan, err := s.buildPlan(ctx, qtx, orderID, true)
		if err != nil {
			return err
		}

		f, err := qtx.CreateFulfillment(ctx, sqlcgen.CreateFulfillmentParams{
			SalesOrderID: orderID, Strategy: string(plan.Strategy),
			ShipmentCount: int32(plan.ShipmentCount), EstimatedCost: plan.EstimatedCost,
		})
		if err != nil {
			return fmt.Errorf("create fulfillment: %w", err)
		}

		if len(plan.Allocations) > 0 {
			lines := make([]sqlcgen.InsertFulfillmentLinesParams, 0, len(plan.Allocations))
			for _, a := range plan.Allocations {
				if _, err := qtx.ReserveStock(ctx, sqlcgen.ReserveStockParams{
					Qty: a.Qty, WarehouseID: a.WarehouseID, ProductID: a.ProductID,
				}); err != nil {
					if errors.Is(err, pgx.ErrNoRows) {
						return apierr.Conflict("stock changed while this order was being fulfilled; try again")
					}
					return fmt.Errorf("reserve stock: %w", err)
				}
				lines = append(lines, sqlcgen.InsertFulfillmentLinesParams{
					FulfillmentID: f.ID, WarehouseID: a.WarehouseID, ProductID: a.ProductID,
					Qty: a.Qty, ShipmentGroup: int32(a.ShipmentGroup),
				})
			}
			if _, err := qtx.InsertFulfillmentLines(ctx, lines); err != nil {
				return fmt.Errorf("insert fulfillment lines: %w", err)
			}
		}

		for _, b := range plan.Backorders {
			if _, err := qtx.CreateBackorder(ctx, sqlcgen.CreateBackorderParams{
				SalesOrderID: orderID, ProductID: b.ProductID, Qty: b.Qty,
			}); err != nil {
				return fmt.Errorf("create backorder: %w", err)
			}
		}

		status := "FULFILLED"
		if len(plan.Backorders) > 0 {
			status = "PARTIALLY_FULFILLED"
		}
		if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
			ID: orderID, Status: status,
		}); err != nil {
			return fmt.Errorf("update sales order status: %w", err)
		}

		s.quote.audit(ctx, order.Header.QuotationID, "FULFILLMENT_ACCEPTED", actor,
			fmt.Sprintf("%s across %d shipment(s), %d backorder line(s)",
				plan.Strategy, plan.ShipmentCount, len(plan.Backorders)),
			map[string]any{"sales_order_id": orderID, "strategy": string(plan.Strategy)})
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	return s.Get(ctx, actor, orderID)
}

// Consolidate allocates stock that has since arrived against open
// backorders.
func (s *FulfillmentService) Consolidate(ctx context.Context, actor auth.Principal, orderID int64) (Order, error) {
	order, err := s.Get(ctx, actor, orderID)
	if err != nil {
		return Order{}, err
	}
	if len(order.Backorders) == 0 {
		return order, nil
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		consolidatable, err := qtx.ListConsolidatableBackorders(ctx, orderID)
		if err != nil {
			return fmt.Errorf("list consolidatable backorders: %w", err)
		}
		if len(consolidatable) == 0 {
			return nil
		}

		productIDs := make([]int64, 0, len(consolidatable))
		demands := make([]fulfillment.Demand, 0, len(consolidatable))
		for _, b := range consolidatable {
			productIDs = append(productIDs, b.ProductID)
			demands = append(demands, fulfillment.Demand{
				ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty,
			})
		}

		warehouseRows, err := qtx.ListWarehouses(ctx)
		if err != nil {
			return fmt.Errorf("list warehouses: %w", err)
		}
		warehouses := make([]fulfillment.Warehouse, 0, len(warehouseRows))
		for _, w := range warehouseRows {
			warehouses = append(warehouses, fulfillment.Warehouse{
				ID: w.ID, Name: w.Name, ShippingCostWeight: w.ShippingCostWeight,
			})
		}

		lockedStock, err := qtx.LockStockForProducts(ctx, productIDs)
		if err != nil {
			return fmt.Errorf("lock stock for products: %w", err)
		}
		stock := make([]fulfillment.Stock, 0, len(lockedStock))
		for _, r := range lockedStock {
			stock = append(stock, fulfillment.Stock{
				WarehouseID: r.WarehouseID, ProductID: r.ProductID, Available: r.Available,
			})
		}

		plan := fulfillment.Split(demands, stock, warehouses)
		if len(plan.Allocations) == 0 {
			return nil
		}

		f, err := qtx.CreateFulfillment(ctx, sqlcgen.CreateFulfillmentParams{
			SalesOrderID: orderID, Strategy: string(plan.Strategy),
			ShipmentCount: int32(plan.ShipmentCount), EstimatedCost: plan.EstimatedCost,
			IsManualOverride: false,
		})
		if err != nil {
			return fmt.Errorf("create fulfillment: %w", err)
		}

		lines := make([]sqlcgen.InsertFulfillmentLinesParams, 0, len(plan.Allocations))
		for _, a := range plan.Allocations {
			if _, err := qtx.ReserveStock(ctx, sqlcgen.ReserveStockParams{
				Qty: a.Qty, WarehouseID: a.WarehouseID, ProductID: a.ProductID,
			}); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return apierr.Conflict("stock changed while consolidating backorders; try again")
				}
				return fmt.Errorf("reserve stock: %w", err)
			}
			lines = append(lines, sqlcgen.InsertFulfillmentLinesParams{
				FulfillmentID: f.ID, WarehouseID: a.WarehouseID, ProductID: a.ProductID,
				Qty: a.Qty, ShipmentGroup: int32(a.ShipmentGroup),
			})
		}
		if _, err := qtx.InsertFulfillmentLines(ctx, lines); err != nil {
			return fmt.Errorf("insert fulfillment lines: %w", err)
		}

		// A backorder resolves only once the plan covered its product in
		// full; a partial arrival leaves it open for the next attempt.
		stillShort := make(map[int64]bool, len(plan.Backorders))
		for _, b := range plan.Backorders {
			stillShort[b.ProductID] = true
		}
		for _, b := range consolidatable {
			if stillShort[b.ProductID] {
				continue
			}
			if _, err := qtx.ResolveBackorder(ctx, b.ID); err != nil {
				return fmt.Errorf("resolve backorder %d: %w", b.ID, err)
			}
		}

		remaining, err := qtx.ListOpenBackorders(ctx, orderID)
		if err != nil {
			return fmt.Errorf("list open backorders: %w", err)
		}
		if len(remaining) == 0 {
			if _, err := qtx.UpdateSalesOrderStatus(ctx, sqlcgen.UpdateSalesOrderStatusParams{
				ID: orderID, Status: "FULFILLED",
			}); err != nil {
				return fmt.Errorf("update sales order status: %w", err)
			}
		}

		s.quote.audit(ctx, order.Header.QuotationID, "BACKORDER_CONSOLIDATED", actor,
			fmt.Sprintf("%d backorder line(s) allocated from newly arrived stock", len(consolidatable)-len(remaining)),
			map[string]any{"sales_order_id": orderID})
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Order{}, apiErr
		}
		return Order{}, apierr.Internal(err)
	}

	return s.Get(ctx, actor, orderID)
}
