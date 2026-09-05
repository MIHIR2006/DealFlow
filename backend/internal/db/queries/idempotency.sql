-- name: GetIdempotentResponse :one
SELECT * FROM idempotency_keys WHERE key = $1 AND endpoint = $2;

-- Returns nothing when the key already exists, which is how a concurrent
-- replay is detected without a second round trip.
-- name: SaveIdempotentResponse :one
INSERT INTO idempotency_keys (key, endpoint, request_hash, response_status, response_body)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (key, endpoint) DO NOTHING
RETURNING *;

-- Reserves a key before the work runs, so two concurrent replays cannot both
-- execute. Returning no row means someone else owns this key.
-- name: ReserveIdempotencyKey :one
INSERT INTO idempotency_keys (key, endpoint, request_hash, response_status, response_body)
VALUES ($1, $2, $3, 0, '{}')
ON CONFLICT (key, endpoint) DO NOTHING
RETURNING *;

-- name: CompleteIdempotencyKey :exec
UPDATE idempotency_keys
SET response_status = $3, response_body = $4
WHERE key = $1 AND endpoint = $2;

-- name: ReleaseIdempotencyKey :exec
DELETE FROM idempotency_keys
WHERE key = $1 AND endpoint = $2 AND response_status = 0;
