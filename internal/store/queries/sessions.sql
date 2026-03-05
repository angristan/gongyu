-- name: CreateSession :exec
INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3);

-- name: GetSession :one
SELECT token, user_id, expires_at FROM sessions WHERE token = $1;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token = $1;
