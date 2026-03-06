-- name: CreateUser :one
INSERT INTO users (name, email, password, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, name, email, password, created_at, updated_at;

-- name: GetUserByEmail :one
SELECT id, name, email, password, created_at, updated_at
FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT id, name, email, password, created_at, updated_at
FROM users WHERE id = $1;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;
