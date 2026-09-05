-- name: AppendAuditLog :one
INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, actor_label, note, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListAuditLogs :many
SELECT * FROM audit_logs
WHERE entity_type = $1 AND entity_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3;
