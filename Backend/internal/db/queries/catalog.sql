-- name: ListProducts :many
SELECT p.*, c.name AS category_name
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.is_active
  AND (sqlc.narg('category_id')::bigint IS NULL OR p.category_id = sqlc.narg('category_id')::bigint)
  AND (sqlc.narg('cursor')::bigint IS NULL OR p.id > sqlc.narg('cursor')::bigint)
ORDER BY p.id
LIMIT sqlc.arg('page_size');

-- name: GetProduct :one
SELECT p.*, c.name AS category_name
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = $1;

-- Batch load for a set of products. This is the shape every nested read uses:
-- one query for the parents, one for the children keyed by ANY($1), then an
-- in-memory join. It is what keeps a quotation detail at a fixed query count
-- no matter how many lines it has.
-- name: GetProductsByIDs :many
SELECT p.*, c.name AS category_name
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = ANY($1::bigint[]);

-- name: CreateProduct :one
INSERT INTO products
    (category_id, sku, name, description, unit, unit_price, unit_cost,
     tax_rate_pct, is_promoted, is_subscription)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: UpdateProduct :one
UPDATE products
SET category_id     = $2,
    name            = $3,
    description     = $4,
    unit            = $5,
    unit_price      = $6,
    unit_cost       = $7,
    tax_rate_pct    = $8,
    is_promoted     = $9,
    is_subscription = $10,
    is_active       = $11,
    updated_at      = now()
WHERE id = $1
RETURNING *;

-- name: ListSubscriptionPlans :many
SELECT * FROM subscription_plans WHERE is_active ORDER BY id;

-- name: CreateSubscriptionPlan :one
INSERT INTO subscription_plans (name, period, cycles)
VALUES ($1, $2, $3)
RETURNING *;

-- Ranked upsell suggestions for the products already in a cart, excluding
-- anything the rep has added. One join, no per-line query.
-- name: SuggestUpsells :many
SELECT DISTINCT ON (sp.id)
    sp.id, sp.name, sp.sku, sp.unit_price, sp.unit_cost,
    sp.is_promoted, sp.category_id,
    ur.score, ur.min_margin_pct
FROM upsell_rules ur
JOIN products sp ON sp.id = ur.suggested_product_id
WHERE ur.is_active
  AND sp.is_active
  AND ur.product_id = ANY($1::bigint[])
  AND NOT (sp.id = ANY($1::bigint[]))
ORDER BY sp.id, ur.score DESC;

-- name: CreateUpsellRule :one
INSERT INTO upsell_rules (product_id, suggested_product_id, score, min_margin_pct)
VALUES ($1, $2, $3, $4)
ON CONFLICT (product_id, suggested_product_id) DO UPDATE
    SET score = EXCLUDED.score, min_margin_pct = EXCLUDED.min_margin_pct
RETURNING *;
