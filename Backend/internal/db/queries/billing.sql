-- name: CreateInvoice :one
INSERT INTO invoices
    (reference, sales_order_id, kind, status, issue_date, due_date,
     subtotal, tax_total, total)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetInvoice :one
SELECT i.*, so.reference AS order_reference, c.name AS customer_name
FROM invoices i
JOIN sales_orders so ON so.id = i.sales_order_id
JOIN customers    c  ON c.id  = so.customer_id
WHERE i.id = $1;

-- name: ListInvoicesForOrder :many
SELECT * FROM invoices WHERE sales_order_id = $1 ORDER BY id;

-- name: ListInvoices :many
SELECT i.*, so.reference AS order_reference, c.name AS customer_name
FROM invoices i
JOIN sales_orders so ON so.id = i.sales_order_id
JOIN customers    c  ON c.id  = so.customer_id
WHERE (sqlc.narg('status')::text IS NULL OR i.status = sqlc.narg('status')::text)
  AND (sqlc.narg('cursor')::bigint IS NULL OR i.id < sqlc.narg('cursor')::bigint)
ORDER BY i.id DESC
LIMIT sqlc.arg('page_size');

-- name: InsertInvoiceLines :copyfrom
INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, net_amount, tax_amount)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: ListInvoiceLines :many
SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY id;

-- name: NextInvoiceReference :one
SELECT ('INV-' || to_char(nextval('invoices_id_seq'), 'FM0000'))::text AS reference;

-- name: CreatePayment :one
INSERT INTO payments (invoice_id, amount, method, reference, recorded_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- Recomputes paid amount and status from the payments actually recorded, so
-- the invoice can never drift from its ledger. A short payment lands on
-- PARTIAL, not PAID.
-- name: RecalculateInvoicePayment :one
UPDATE invoices i
SET amount_paid = sub.paid,
    status = CASE
        WHEN sub.paid >= i.total THEN 'PAID'
        WHEN sub.paid > 0        THEN 'PARTIAL'
        ELSE i.status
    END,
    updated_at = now()
FROM (
    SELECT COALESCE(SUM(amount), 0)::numeric AS paid
    FROM payments WHERE invoice_id = $1
) sub
WHERE i.id = $1
RETURNING i.*;

-- name: ListPaymentsForInvoice :many
SELECT * FROM payments WHERE invoice_id = $1 ORDER BY received_at, id;

-- name: InsertBillingSchedules :copyfrom
INSERT INTO billing_schedules
    (sales_order_id, quotation_line_id, plan_id, seq, period_start, period_end, amount, proration_factor)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ListBillingSchedulesForOrder :many
SELECT bs.*, p.name AS plan_name, prod.name AS product_name
FROM billing_schedules bs
JOIN subscription_plans p ON p.id = bs.plan_id
JOIN quotation_lines   ql ON ql.id = bs.quotation_line_id
JOIN products        prod ON prod.id = ql.product_id
WHERE bs.sales_order_id = $1
ORDER BY bs.quotation_line_id, bs.seq;

-- Drives the recurring-billing background job; covered by the partial index
-- idx_billing_schedules_due.
-- name: ListDueBillingSchedules :many
SELECT * FROM billing_schedules
WHERE status = 'SCHEDULED' AND period_start <= now()
ORDER BY period_start, id
LIMIT $1;

-- name: MarkBillingScheduleInvoiced :exec
UPDATE billing_schedules SET status = 'INVOICED', invoice_id = $2 WHERE id = $1;

-- name: NextCreditNoteReference :one
SELECT ('CN-' || to_char(nextval('credit_notes_id_seq'), 'FM0000'))::text AS reference;

-- name: CreateCreditNote :one
INSERT INTO credit_notes
    (reference, sales_order_id, billing_schedule_id, quotation_line_id,
     amount, proration_factor, reason, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListCreditNotesForOrder :many
SELECT * FROM credit_notes WHERE sales_order_id = $1 ORDER BY id;

-- name: CancelRemainingSchedules :execrows
UPDATE billing_schedules
SET status = 'CANCELLED'
WHERE quotation_line_id = $1 AND status = 'SCHEDULED' AND period_start > now();

-- name: GetCurrentBillingPeriod :one
SELECT * FROM billing_schedules
WHERE quotation_line_id = $1
  AND status = 'SCHEDULED'
  AND period_start <= now() AND period_end > now()
ORDER BY seq
LIMIT 1;

-- name: UpdateScheduleAmountsFrom :execrows
UPDATE billing_schedules
SET amount = sqlc.arg('amount')::numeric
WHERE quotation_line_id = sqlc.arg('quotation_line_id')
  AND status = 'SCHEDULED'
  AND seq > sqlc.arg('after_seq')::int;

-- name: CancelScheduleAmountsFrom :execrows
-- A subscription reduced to zero seats stops billing outright: every future
-- period is marked CANCELLED rather than merely re-priced to zero, so the
-- schedule reads as "this stopped" rather than "this happens to cost nothing".
UPDATE billing_schedules
SET amount = 0, status = 'CANCELLED'
WHERE quotation_line_id = sqlc.arg('quotation_line_id')
  AND status = 'SCHEDULED'
  AND seq > sqlc.arg('after_seq')::int;

-- name: AdjustScheduleAmount :one
UPDATE billing_schedules
SET amount = amount + sqlc.arg('delta')::numeric
WHERE id = sqlc.arg('id')
RETURNING *;
