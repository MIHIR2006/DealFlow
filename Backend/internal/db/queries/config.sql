-- The governance configuration is small, changes rarely, and is read on every
-- keystroke in the quotation builder. These four queries populate the
-- in-process config cache once at boot and again after any admin write, so
-- scoring a quotation costs zero database reads.

-- name: ListDiscountTiers :many
SELECT * FROM discount_tiers ORDER BY tier;

-- name: ListCategoryCeilings :many
SELECT cc.*, c.name AS category_name
FROM category_ceilings cc
JOIN categories c ON c.id = cc.category_id
ORDER BY cc.category_id;

-- name: ListApprovalPolicies :many
SELECT * FROM approval_policies WHERE is_active ORDER BY id;

-- name: ListCategories :many
SELECT * FROM categories ORDER BY name;

-- name: UpsertDiscountTier :one
INSERT INTO discount_tiers (tier, max_discount_pct)
VALUES ($1, $2)
ON CONFLICT (tier) DO UPDATE
    SET max_discount_pct = EXCLUDED.max_discount_pct,
        updated_at       = now()
RETURNING *;

-- name: UpsertCategoryCeiling :one
INSERT INTO category_ceilings (category_id, max_discount_pct)
VALUES ($1, $2)
ON CONFLICT (category_id) DO UPDATE
    SET max_discount_pct = EXCLUDED.max_discount_pct,
        updated_at       = now()
RETURNING *;

-- name: CreateApprovalPolicy :one
INSERT INTO approval_policies
    (name, min_blended, min_line_overage, requires_manager, requires_finance)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateApprovalPolicy :one
UPDATE approval_policies
SET name             = $2,
    min_blended      = $3,
    min_line_overage = $4,
    requires_manager = $5,
    requires_finance = $6,
    is_active        = $7,
    updated_at       = now()
WHERE id = $1
RETURNING *;

-- name: CreateCategory :one
INSERT INTO categories (name) VALUES ($1) RETURNING *;
