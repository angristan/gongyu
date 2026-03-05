-- +goose Up
CREATE TABLE bookmarks (
    id BIGSERIAL PRIMARY KEY,
    short_url TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    shaarli_short_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookmarks_created_at ON bookmarks(created_at);
CREATE INDEX idx_bookmarks_shaarli_short_url ON bookmarks(shaarli_short_url);

-- +goose Down
DROP TABLE bookmarks;
