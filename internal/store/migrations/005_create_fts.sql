-- +goose Up
CREATE INDEX bookmarks_fts_idx ON bookmarks USING gin(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, ''))
);

-- +goose Down
DROP INDEX IF EXISTS bookmarks_fts_idx;
