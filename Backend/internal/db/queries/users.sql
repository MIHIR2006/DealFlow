-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1 AND is_active LIMIT 1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1 LIMIT 1;

-- name: CreateUser :one
INSERT INTO users (email, password_hash, full_name, role, sales_team)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListUsersByRole :many
SELECT * FROM users WHERE role = $1 AND is_active ORDER BY id;
