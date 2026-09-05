-- Deal health is three fixed aggregate queries, not one query per alert.
-- Aggregation is pushed into Postgres; nothing is summed in Go.

-- Quotations with no activity for longer than the configured window.
-- Covered by idx_quotations_stalled.
-- name: FindStalledQuotations :many
SELECT q.id, q.reference, q.status, q.grand_total, q.last_activity_at,
       EXTRACT(DAY FROM (now() - q.last_activity_at))::int AS days_inactive,
       c.name AS customer_name,
       u.full_name AS rep_name
FROM quotations q
JOIN customers c ON c.id = q.customer_id
JOIN users     u ON u.id = q.rep_id
WHERE q.status IN ('DRAFT','PENDING_APPROVAL','SENT','UNDER_NEGOTIATION')
  AND q.last_activity_at < now() - make_interval(days => sqlc.arg('stall_days')::int)
ORDER BY q.last_activity_at
LIMIT sqlc.arg('page_size');

-- Quotations discounted far above the rep's own historical average. Comparing
-- a rep against their own baseline catches an outlier that a company-wide
-- threshold would miss.
-- name: FindDiscountAnomalies :many
WITH rep_baseline AS (
    SELECT q.rep_id,
           AVG(NULLIF(q.discount_total / NULLIF(q.list_subtotal, 0) * 100, 0)) AS avg_discount_pct,
           count(*) AS sample_size
    FROM quotations q
    WHERE q.list_subtotal > 0
    GROUP BY q.rep_id
    HAVING count(*) >= sqlc.arg('min_sample')::int
)
SELECT q.id, q.reference, q.grand_total,
       (q.discount_total / NULLIF(q.list_subtotal, 0) * 100)::numeric AS discount_pct,
       rb.avg_discount_pct::numeric AS baseline_pct,
       c.name AS customer_name,
       u.full_name AS rep_name
FROM quotations q
JOIN rep_baseline rb ON rb.rep_id = q.rep_id
JOIN customers c ON c.id = q.customer_id
JOIN users     u ON u.id = q.rep_id
WHERE q.list_subtotal > 0
  AND rb.avg_discount_pct > 0
  AND (q.discount_total / q.list_subtotal * 100) >
      rb.avg_discount_pct * sqlc.arg('multiplier')::numeric
ORDER BY (q.discount_total / NULLIF(q.list_subtotal, 0)) DESC
LIMIT sqlc.arg('page_size');

-- Orders past their promised date and not yet fully shipped.
-- name: FindDeliverySlippage :many
SELECT so.id, so.reference, so.status, so.promised_date,
       EXTRACT(DAY FROM (now() - so.promised_date))::int AS days_late,
       c.name AS customer_name
FROM sales_orders so
JOIN customers c ON c.id = so.customer_id
WHERE so.promised_date IS NOT NULL
  AND so.promised_date < now()
  AND so.status IN ('CONFIRMED','PARTIALLY_FULFILLED')
ORDER BY so.promised_date
LIMIT sqlc.arg('page_size');

-- name: QuotationStatusCounts :many
SELECT status, count(*)::bigint AS total, COALESCE(SUM(grand_total), 0)::numeric AS value
FROM quotations
GROUP BY status
ORDER BY status;

-- Reporting with the four filters the problem statement names: period, rep or
-- team, approval status, and product category.
-- name: SalesReport :many
SELECT
    u.full_name AS rep_name,
    u.sales_team,
    cat.name AS category_name,
    count(DISTINCT q.id)::bigint AS quotation_count,
    COALESCE(SUM(ql.net_amount), 0)::numeric AS net_revenue,
    COALESCE(SUM(ql.margin_amount), 0)::numeric AS margin,
    COALESCE(SUM(ql.discount_amount), 0)::numeric AS discount_given
FROM quotations q
JOIN users           u   ON u.id   = q.rep_id
JOIN quotation_lines ql  ON ql.quotation_id = q.id
JOIN categories      cat ON cat.id = ql.category_id
WHERE (sqlc.narg('from')::timestamptz IS NULL OR q.created_at >= sqlc.narg('from')::timestamptz)
  AND (sqlc.narg('to')::timestamptz   IS NULL OR q.created_at <  sqlc.narg('to')::timestamptz)
  AND (sqlc.narg('rep_id')::bigint    IS NULL OR q.rep_id     = sqlc.narg('rep_id')::bigint)
  AND (sqlc.narg('sales_team')::text  IS NULL OR u.sales_team = sqlc.narg('sales_team')::text)
  AND (sqlc.narg('status')::text      IS NULL OR q.status     = sqlc.narg('status')::text)
  AND (sqlc.narg('category_id')::bigint IS NULL OR ql.category_id = sqlc.narg('category_id')::bigint)
GROUP BY u.full_name, u.sales_team, cat.name
ORDER BY net_revenue DESC;

-- name: CreateDealAlert :one
INSERT INTO deal_alerts (quotation_id, alert_type, severity, detail, metric)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListOpenDealAlerts :many
SELECT da.*, q.reference, c.name AS customer_name
FROM deal_alerts da
JOIN quotations q ON q.id = da.quotation_id
JOIN customers  c ON c.id = q.customer_id
WHERE da.resolved_at IS NULL
ORDER BY da.created_at DESC
LIMIT $1;

-- name: ResolveDealAlert :exec
UPDATE deal_alerts SET resolved_at = now() WHERE id = $1;

-- A nudge counts as activity, which is what takes the deal off the stalled
-- list. The alert it came from is resolved separately.
-- name: NudgeQuotation :one
UPDATE quotations
SET last_activity_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ResolveAlertsForQuotation :execrows
UPDATE deal_alerts SET resolved_at = now()
WHERE quotation_id = $1 AND alert_type = sqlc.arg('alert_type')::text AND resolved_at IS NULL;

-- Headline figures for the dashboard, in one pass rather than one query per
-- tile.
-- name: PipelineSummary :one
SELECT
    count(*)::bigint AS total_quotations,
    COALESCE(SUM(grand_total), 0)::numeric AS pipeline_value,
    COALESCE(SUM(grand_total) FILTER (WHERE status = 'CONFIRMED'), 0)::numeric AS won_value,
    COALESCE(AVG(NULLIF(margin_pct, 0)), 0)::numeric AS avg_margin_pct,
    count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::bigint AS awaiting_approval,
    COALESCE(AVG(NULLIF(blended_risk_score, 0)), 0)::numeric AS avg_risk_score
FROM quotations
WHERE (sqlc.narg('from')::timestamptz IS NULL OR created_at >= sqlc.narg('from')::timestamptz)
  AND (sqlc.narg('to')::timestamptz   IS NULL OR created_at <  sqlc.narg('to')::timestamptz);
