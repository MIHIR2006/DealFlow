-- The quotation list. Customer and rep are joined, totals come from stored
-- columns, and the line count is a scalar subquery — so the whole page costs
-- one query regardless of how many quotations or lines it contains.
-- name: ListQuotations :many
SELECT
    q.*,
    c.name  AS customer_name,
    c.tier  AS customer_tier,
    u.full_name AS rep_name,
    (SELECT count(*) FROM quotation_lines ql WHERE ql.quotation_id = q.id) AS line_count
FROM quotations q
JOIN customers c ON c.id = q.customer_id
JOIN users     u ON u.id = q.rep_id
WHERE (sqlc.narg('status')::text     IS NULL OR q.status      = sqlc.narg('status')::text)
  AND (sqlc.narg('rep_id')::bigint   IS NULL OR q.rep_id      = sqlc.narg('rep_id')::bigint)
  AND (sqlc.narg('customer_id')::bigint IS NULL OR q.customer_id = sqlc.narg('customer_id')::bigint)
  AND (sqlc.narg('sales_team')::text IS NULL OR u.sales_team  = sqlc.narg('sales_team')::text)
  AND (sqlc.narg('cursor')::bigint   IS NULL OR q.id          < sqlc.narg('cursor')::bigint)
ORDER BY q.id DESC
LIMIT sqlc.arg('page_size');

-- name: GetQuotation :one
SELECT
    q.*,
    c.name AS customer_name,
    c.tier AS customer_tier,
    c.email AS customer_email,
    u.full_name AS rep_name,
    u.sales_team AS rep_sales_team
FROM quotations q
JOIN customers c ON c.id = q.customer_id
JOIN users     u ON u.id = q.rep_id
WHERE q.id = $1;

-- Lines with their product and category joined in. One query for all lines of
-- a quotation, never one per line.
-- name: ListQuotationLines :many
SELECT ql.*, p.name AS product_name, p.sku, cat.name AS category_name,
       sp.name AS plan_name, sp.period AS plan_period, sp.cycles AS plan_cycles
FROM quotation_lines ql
JOIN products   p   ON p.id   = ql.product_id
JOIN categories cat ON cat.id = ql.category_id
LEFT JOIN subscription_plans sp ON sp.id = ql.plan_id
WHERE ql.quotation_id = $1
ORDER BY ql.position, ql.id;

-- Batch variant for a set of quotations, used wherever several quotations are
-- rendered with their lines.
-- name: ListQuotationLinesForQuotations :many
SELECT ql.*, p.name AS product_name, cat.name AS category_name
FROM quotation_lines ql
JOIN products   p   ON p.id   = ql.product_id
JOIN categories cat ON cat.id = ql.category_id
WHERE ql.quotation_id = ANY($1::bigint[])
ORDER BY ql.quotation_id, ql.position, ql.id;

-- name: CreateQuotation :one
INSERT INTO quotations (reference, customer_id, rep_id)
VALUES ($1, $2, $3)
RETURNING *;

-- The next position is computed in the same statement rather than fetched
-- first: a separate SELECT would double the round trips on the hottest write
-- in the builder, and could race with a concurrent insert besides.
-- name: InsertQuotationLine :one
INSERT INTO quotation_lines (
    quotation_id, product_id, category_id, position,
    qty, unit_price, unit_cost, line_discount_pct, tax_rate_pct,
    line_type, plan_id
) VALUES (
    @quotation_id, @product_id, @category_id,
    (SELECT COALESCE(max(position), 0) + 1
       FROM quotation_lines WHERE quotation_id = @quotation_id),
    @qty, @unit_price, @unit_cost, @line_discount_pct, @tax_rate_pct,
    @line_type, @plan_id
)
RETURNING *;

-- name: UpdateQuotationLineInput :one
UPDATE quotation_lines
SET qty               = $2,
    line_discount_pct = $3,
    updated_at        = now()
WHERE id = $1
RETURNING *;

-- Writes back what the pricing engine computed. Storing these means list
-- views and dashboards read columns instead of re-running the engine per row.
-- name: UpdateQuotationLineComputed :exec
UPDATE quotation_lines
SET effective_discount_pct = $2,
    list_value             = $3,
    discount_amount        = $4,
    net_amount             = $5,
    tax_amount             = $6,
    cost_amount            = $7,
    margin_amount          = $8,
    margin_pct             = $9,
    ceiling_pct            = $10,
    overage_pts            = $11,
    updated_at             = now()
WHERE id = $1;

-- name: DeleteQuotationLine :execrows
DELETE FROM quotation_lines WHERE id = $1 AND quotation_id = $2;

-- Optimistic locking: the update only applies when the caller's version is
-- still current, so two reps editing one quotation cannot silently clobber
-- each other. Zero rows returned means "someone else changed it".
-- name: UpdateQuotationTotals :one
UPDATE quotations
SET list_subtotal      = $3,
    discount_total     = $4,
    net_subtotal       = $5,
    tax_total          = $6,
    grand_total        = $7,
    cost_total         = $8,
    margin_amount      = $9,
    margin_pct         = $10,
    blended_risk_score = $11,
    max_line_overage   = $12,
    required_level     = $13,
    matched_policy_id  = $14,
    risk_rationale     = $15,
    order_discount_pct = $16,
    version            = version + 1,
    last_activity_at   = now(),
    updated_at         = now()
WHERE id = $1 AND version = $2
RETURNING *;

-- name: UpdateQuotationStatus :one
UPDATE quotations
SET status           = $2,
    last_activity_at = now(),
    updated_at       = now(),
    version          = version + 1
WHERE id = $1
RETURNING *;

-- name: TouchQuotation :exec
UPDATE quotations SET last_activity_at = now() WHERE id = $1;

-- name: NextQuotationReference :one
SELECT ('Q-' || to_char(nextval('quotations_id_seq'), 'FM0000'))::text AS reference;

-- Writes every line's computed values in one statement.
--
-- Recalculation touches all lines of a quotation on every keystroke, so
-- updating them one at a time would make the builder's cost grow with the
-- size of the deal. The whole batch arrives as one JSONB document and is
-- expanded into rows, keeping the write at a single round trip.
--
-- Every numeric arrives as text and is cast here: decimal values serialise as
-- JSON strings precisely so they never pass through a float on the way.
-- name: UpdateQuotationLinesComputed :exec
UPDATE quotation_lines ql
SET effective_discount_pct = v.effective_discount_pct::numeric,
    list_value             = v.list_value::numeric,
    discount_amount        = v.discount_amount::numeric,
    net_amount             = v.net_amount::numeric,
    tax_amount             = v.tax_amount::numeric,
    cost_amount            = v.cost_amount::numeric,
    margin_amount          = v.margin_amount::numeric,
    margin_pct             = v.margin_pct::numeric,
    ceiling_pct            = v.ceiling_pct::numeric,
    overage_pts            = v.overage_pts::numeric,
    updated_at             = now()
FROM jsonb_to_recordset(@lines::jsonb) AS v(
    id                     bigint,
    effective_discount_pct text,
    list_value             text,
    discount_amount        text,
    net_amount             text,
    tax_amount             text,
    cost_amount            text,
    margin_amount          text,
    margin_pct             text,
    ceiling_pct            text,
    overage_pts            text
)
WHERE ql.id = v.id AND ql.quotation_id = @quotation_id;

-- name: GetQuotationLine :one
SELECT ql.*, p.name AS product_name, cat.name AS category_name
FROM quotation_lines ql
JOIN products   p   ON p.id   = ql.product_id
JOIN categories cat ON cat.id = ql.category_id
WHERE ql.id = $1 AND ql.quotation_id = $2;

