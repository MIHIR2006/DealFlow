-- name: CreateSalesOrder :one
INSERT INTO sales_orders (reference, quotation_id, customer_id, promised_date)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetSalesOrder :one
SELECT so.*, q.reference AS quotation_reference, c.name AS customer_name
FROM sales_orders so
JOIN quotations q ON q.id = so.quotation_id
JOIN customers  c ON c.id = so.customer_id
WHERE so.id = $1;

-- name: GetSalesOrderByQuotation :one
SELECT * FROM sales_orders WHERE quotation_id = $1;

-- name: UpdateSalesOrderStatus :one
UPDATE sales_orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: NextSalesOrderReference :one
SELECT ('SO-' || to_char(nextval('sales_orders_id_seq'), 'FM0000'))::text AS reference;

-- name: CreateFulfillment :one
INSERT INTO fulfillments
    (sales_order_id, strategy, shipment_count, estimated_cost, is_manual_override)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetFulfillmentForOrder :one
SELECT * FROM fulfillments WHERE sales_order_id = $1 ORDER BY id DESC LIMIT 1;

-- Consolidating a backorder adds shipments to the order's one fulfillment
-- record rather than opening a second one, so a single GET always shows
-- every line ever allocated to the order in one place.
-- name: AddToFulfillmentTotals :one
UPDATE fulfillments
SET shipment_count = shipment_count + sqlc.arg('added_shipments')::int,
    estimated_cost = estimated_cost + sqlc.arg('added_cost')::numeric
WHERE id = sqlc.arg('id')
RETURNING *;

-- Bulk insert of the split result. One statement for every allocation,
-- never one insert per warehouse line.
-- name: InsertFulfillmentLines :copyfrom
INSERT INTO fulfillment_lines (fulfillment_id, warehouse_id, product_id, qty, shipment_group)
VALUES ($1, $2, $3, $4, $5);

-- name: ListFulfillmentLines :many
SELECT fl.*, w.name AS warehouse_name, p.name AS product_name
FROM fulfillment_lines fl
JOIN warehouses w ON w.id = fl.warehouse_id
JOIN products   p ON p.id = fl.product_id
WHERE fl.fulfillment_id = $1
ORDER BY fl.shipment_group, fl.id;

-- name: CreateBackorder :one
INSERT INTO backorders (sales_order_id, product_id, qty)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListOpenBackorders :many
SELECT b.*, p.name AS product_name
FROM backorders b
JOIN products p ON p.id = b.product_id
WHERE b.sales_order_id = $1 AND b.status = 'OPEN'
ORDER BY b.id;

-- Open backorders whose product now has stock somewhere. This is what raises
-- the "stock arrived, consolidate?" prompt.
-- name: ListConsolidatableBackorders :many
SELECT b.*, p.name AS product_name,
       COALESCE(SUM(si.on_hand - si.reserved), 0)::bigint AS available
FROM backorders b
JOIN products p ON p.id = b.product_id
LEFT JOIN stock_items si ON si.product_id = b.product_id
WHERE b.sales_order_id = $1 AND b.status = 'OPEN'
GROUP BY b.id, p.name
HAVING COALESCE(SUM(si.on_hand - si.reserved), 0) >= b.qty;

-- name: ResolveBackorder :one
UPDATE backorders SET status = 'CONSOLIDATED', resolved_at = now()
WHERE id = $1 AND status = 'OPEN'
RETURNING *;

-- The physical lines of an order. Recurring subscription lines are billed,
-- never shipped, so they are excluded here rather than filtered in Go.
-- name: ListFulfillableLines :many
SELECT ql.id, ql.product_id, ql.qty, ql.unit_price, ql.list_value,
       p.name AS product_name
FROM quotation_lines ql
JOIN products p       ON p.id  = ql.product_id
JOIN sales_orders so  ON so.quotation_id = ql.quotation_id
WHERE so.id = $1 AND ql.line_type = 'ONETIME'
ORDER BY ql.position, ql.id;

-- name: CountFulfillmentsForOrder :one
SELECT count(*)::bigint FROM fulfillments WHERE sales_order_id = $1;

-- name: ReleaseStock :exec
UPDATE stock_items
SET reserved = GREATEST(reserved - sqlc.arg('qty')::bigint, 0), updated_at = now()
WHERE warehouse_id = sqlc.arg('warehouse_id') AND product_id = sqlc.arg('product_id');
