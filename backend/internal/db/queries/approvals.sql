-- The approvals inbox, scoped to the caller's role. Partial index
-- idx_approval_requests_inbox covers the WHERE clause.
-- name: ListPendingApprovals :many
SELECT ar.*,
       q.reference, q.grand_total, q.blended_risk_score, q.max_line_overage,
       q.required_level, q.status AS quotation_status,
       c.name AS customer_name, c.tier AS customer_tier,
       u.full_name AS rep_name
FROM approval_requests ar
JOIN quotations q ON q.id = ar.quotation_id
JOIN customers  c ON c.id = q.customer_id
JOIN users      u ON u.id = q.rep_id
WHERE ar.status = 'PENDING'
  AND (sqlc.narg('required_role')::text IS NULL OR ar.required_role = sqlc.narg('required_role')::text)
  AND (sqlc.narg('cursor')::bigint IS NULL OR ar.id > sqlc.narg('cursor')::bigint)
ORDER BY ar.id
LIMIT sqlc.arg('page_size');

-- Every round, including superseded ones. The approval screen shows the full
-- history: submitted, returned, resubmitted.
-- name: ListApprovalsForQuotation :many
SELECT ar.*, u.full_name AS actor_name
FROM approval_requests ar
LEFT JOIN users u ON u.id = ar.actor_id
WHERE ar.quotation_id = $1
ORDER BY ar.round, ar.step;

-- name: GetApprovalRequest :one
SELECT ar.*, q.rep_id, q.status AS quotation_status, q.reference
FROM approval_requests ar
JOIN quotations q ON q.id = ar.quotation_id
WHERE ar.id = $1;

-- The lowest-numbered pending step of the current round. Approving out of
-- order must be impossible, so the service checks this rather than trusting
-- the id it was handed.
-- name: GetNextPendingApproval :one
SELECT * FROM approval_requests
WHERE quotation_id = $1 AND status = 'PENDING'
ORDER BY round DESC, step
LIMIT 1;

-- name: CountOpenApprovals :one
SELECT count(*) FROM approval_requests
WHERE quotation_id = $1 AND round = $2 AND status = 'PENDING';

-- name: CurrentApprovalRound :one
SELECT COALESCE(max(round), 0)::int AS round
FROM approval_requests WHERE quotation_id = $1;

-- name: CreateApprovalRequest :one
INSERT INTO approval_requests (quotation_id, step, required_role, round)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: DecideApprovalRequest :one
UPDATE approval_requests
SET status = $2, actor_id = $3, reason = $4, decided_at = now()
WHERE id = $1 AND status = 'PENDING'
RETURNING *;

-- A rebuilt chain supersedes the old one but never deletes it, so the audit
-- trail keeps every prior round.
-- name: SupersedeOpenApprovals :execrows
UPDATE approval_requests
SET status = 'SUPERSEDED', decided_at = now()
WHERE quotation_id = $1 AND status = 'PENDING';
