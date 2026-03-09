-- +goose Up
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    encrypted BIGINT NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE settings;
