-- name: GetBookmarkByID :one
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks WHERE id = $1;

-- name: GetBookmarkByShortURL :one
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks WHERE short_url = $1;

-- name: GetBookmarkByURL :one
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks WHERE url = $1;

-- name: GetBookmarkByShaarliHash :one
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks WHERE shaarli_short_url = $1;

-- name: ListBookmarks :many
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks ORDER BY created_at DESC LIMIT $1 OFFSET $2;

-- name: RecentBookmarks :many
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks ORDER BY created_at DESC LIMIT $1;

-- name: AllBookmarks :many
SELECT id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at
FROM bookmarks ORDER BY created_at DESC;

-- name: CountBookmarks :one
SELECT COUNT(*) FROM bookmarks;

-- name: CountBookmarksSince :one
SELECT COUNT(*) FROM bookmarks WHERE created_at >= $1;

-- name: ShortURLExists :one
SELECT EXISTS(SELECT 1 FROM bookmarks WHERE short_url = $1);

-- name: CreateBookmark :one
INSERT INTO bookmarks (short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at;

-- name: UpdateBookmark :exec
UPDATE bookmarks
SET url = $1, title = $2, description = $3, thumbnail_url = $4, shaarli_short_url = $5, updated_at = $6
WHERE id = $7;

-- name: DeleteBookmark :exec
DELETE FROM bookmarks WHERE id = $1;

-- name: DeleteAllBookmarks :execrows
DELETE FROM bookmarks;

-- name: InsertBookmarkIgnore :execrows
INSERT INTO bookmarks (short_url, url, title, description, thumbnail_url, shaarli_short_url, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (url) DO NOTHING;

-- name: BookmarksOverTime :many
SELECT DATE(created_at)::text AS date, COUNT(*)::bigint AS count
FROM bookmarks
WHERE created_at >= $1
GROUP BY date ORDER BY date;

-- name: CountSearchBookmarks :one
WITH query AS (
  SELECT to_tsquery('english', $1) AS q
)
SELECT COUNT(*)
FROM bookmarks b, query
WHERE to_tsvector('english', coalesce(b.title, '') || ' ' || coalesce(b.description, '') || ' ' || coalesce(b.url, ''))
  @@ query.q;

-- name: SearchBookmarks :many
WITH query AS (
  SELECT to_tsquery('english', $1) AS q
)
SELECT b.id, b.short_url, b.url, b.title, b.description, b.thumbnail_url, b.shaarli_short_url, b.created_at, b.updated_at
FROM bookmarks b, query
WHERE to_tsvector('english', coalesce(b.title, '') || ' ' || coalesce(b.description, '') || ' ' || coalesce(b.url, ''))
  @@ query.q
ORDER BY ts_rank(
  to_tsvector('english', coalesce(b.title, '') || ' ' || coalesce(b.description, '') || ' ' || coalesce(b.url, '')),
  query.q
) DESC
LIMIT $2 OFFSET $3;

-- name: TopDomains :many
SELECT
    regexp_replace(substring(url from '://([^/]+)'), '^www\.', '') AS domain,
    COUNT(*)::bigint AS count
FROM bookmarks
WHERE created_at >= $1
GROUP BY domain ORDER BY count DESC LIMIT $2;
