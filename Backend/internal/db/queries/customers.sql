-- name: GetCustomer :one
SELECT * FROM customers WHERE id = $1;

-- name: ListCustomers :many
SELECT * FROM customers
WHERE is_active
  AND (sqlc.narg('cursor')::bigint IS NULL OR id > sqlc.narg('cursor')::bigint)
ORDER BY id
LIMIT sqlc.arg('page_size');

-- name: CreateCustomer :one
INSERT INTO customers (name, email, tier, city, latitude, longitude)
VALUES ($1, $2, $3, sqlc.narg('city'), sqlc.narg('latitude'), sqlc.narg('longitude'))
RETURNING *;
