-- name: GetSetting :one
SELECT key, value, encrypted FROM settings WHERE key = $1;

-- name: UpsertSetting :exec
INSERT INTO settings (key, value, encrypted) VALUES ($1, $2, $3)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, encrypted = EXCLUDED.encrypted;
