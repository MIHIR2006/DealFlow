-- name: ListWarehouses :many
SELECT * FROM warehouses WHERE is_active ORDER BY shipping_cost_weight, id;

-- name: CreateWarehouse :one
INSERT INTO warehouses (name, shipping_cost_weight, city, latitude, longitude)
VALUES ($1, $2, sqlc.narg('city'), sqlc.narg('latitude'), sqlc.narg('longitude'))
RETURNING *;

-- Sets a warehouse's shipping origin. Coordinates are optional metadata; the
-- split engine never reads them.
-- name: SetWarehouseLocation :one
UPDATE warehouses
SET city = sqlc.narg('city'),
    latitude = sqlc.narg('latitude'),
    longitude = sqlc.narg('longitude')
WHERE id = $1
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

-- Locks the stock rows for a set of products and returns them with the
-- warehouse context the split engine needs.
--
-- Planning and reserving must see the same numbers. Without the lock, two
-- orders could each be told the last unit is available and both reserve it.
-- Rows are locked in id order so concurrent transactions queue rather than
-- deadlock. Only the stock rows are locked, not the warehouse rows, which
-- are read-mostly configuration.
-- name: LockStockForProducts :many
SELECT si.id, si.warehouse_id, si.product_id, si.on_hand, si.reserved,
       (si.on_hand - si.reserved)::bigint AS available,
       w.name AS warehouse_name,
       w.shipping_cost_weight
FROM stock_items si
JOIN warehouses w ON w.id = si.warehouse_id
WHERE si.product_id = ANY($1::bigint[])
  AND w.is_active
ORDER BY si.id
FOR UPDATE OF si;

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

-- Availability per product across every active warehouse, for the rep's
-- catalogue. It is a summary, not the split engine's input: the builder needs
-- to show "6 available, across 2 warehouses" beside a product so a rep does
-- not promise stock that is not there, and nothing more.
--
-- Subscription lines never ship, so a product with no stock rows at all is
-- absent here rather than reported as zero — the caller distinguishes the two.
-- name: ProductStockSummary :many
SELECT si.product_id,
       SUM(si.on_hand - si.reserved)::bigint AS available,
       SUM(si.on_hand)::bigint               AS on_hand,
       COUNT(*)::bigint                      AS warehouse_count
FROM stock_items si
JOIN warehouses w ON w.id = si.warehouse_id
WHERE w.is_active
GROUP BY si.product_id
ORDER BY si.product_id;
