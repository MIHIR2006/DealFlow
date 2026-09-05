-- name: GetIdempotentResponse :one
SELECT * FROM idempotency_keys WHERE key = $1 AND endpoint = $2;

-- Returns nothing when the key already exists, which is how a concurrent
-- replay is detected without a second round trip.
-- name: SaveIdempotentResponse :one
INSERT INTO idempotency_keys (key, endpoint, request_hash, response_status, response_body)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (key, endpoint) DO NOTHING
RETURNING *;
