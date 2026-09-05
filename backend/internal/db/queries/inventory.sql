-- name: ListWarehouses :many
SELECT * FROM warehouses WHERE is_active ORDER BY shipping_cost_weight, id;

-- name: CreateWarehouse :one
INSERT INTO warehouses (name, shipping_cost_weight)
VALUES ($1, $2)
RETURNING *;

-- Availability for a set of products across every warehouse, in one query.
-- The split engine gets a complete picture without N x M round trips.
-- name: GetStockForProducts :many
SELECT si.warehouse_id, si.product_id,
       (si.on_hand - si.reserved)::bigint AS available,
       w.name AS warehouse_name,
       w.shipping_cost_weight
FROM stock_items si
JOIN warehouses w ON w.id = si.warehouse_id
WHERE si.product_id = ANY($1::bigint[])
  AND w.is_active
ORDER BY si.warehouse_id, si.product_id;

-- Locks the rows before reserving so two orders racing for the last unit
-- cannot both win. Must run inside a transaction.
-- name: LockStockForProducts :many
SELECT si.id, si.warehouse_id, si.product_id, si.on_hand, si.reserved
FROM stock_items si
WHERE si.product_id = ANY($1::bigint[])
ORDER BY si.id
FOR UPDATE;

-- name: ReserveStock :one
UPDATE stock_items
SET reserved   = reserved + sqlc.arg('qty')::bigint,
    updated_at = now()
WHERE warehouse_id = sqlc.arg('warehouse_id')
  AND product_id   = sqlc.arg('product_id')
  AND (on_hand - reserved) >= sqlc.arg('qty')::bigint
RETURNING *;

-- name: UpsertStock :one
INSERT INTO stock_items (warehouse_id, product_id, on_hand)
VALUES ($1, $2, $3)
ON CONFLICT (warehouse_id, product_id) DO UPDATE
    SET on_hand = EXCLUDED.on_hand, updated_at = now()
RETURNING *;

-- name: AddStock :one
UPDATE stock_items
SET on_hand = on_hand + sqlc.arg('qty')::bigint, updated_at = now()
WHERE warehouse_id = sqlc.arg('warehouse_id') AND product_id = sqlc.arg('product_id')
RETURNING *;
