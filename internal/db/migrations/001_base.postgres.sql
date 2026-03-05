CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id BIGSERIAL PRIMARY KEY,
    short_url VARCHAR(8) NOT NULL UNIQUE,
    url VARCHAR(2048) NOT NULL UNIQUE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    thumbnail_url VARCHAR(2048),
    shaarli_short_url VARCHAR(10),
    search_vector tsvector,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_created_at_idx ON bookmarks(created_at);
CREATE INDEX IF NOT EXISTS bookmarks_shaarli_short_url_idx ON bookmarks(shaarli_short_url);
CREATE INDEX IF NOT EXISTS bookmarks_search_vector_idx ON bookmarks USING GIN(search_vector);

CREATE OR REPLACE FUNCTION bookmarks_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.url, ''));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookmarks_search_vector_trigger ON bookmarks;
CREATE TRIGGER bookmarks_search_vector_trigger
BEFORE INSERT OR UPDATE ON bookmarks
FOR EACH ROW EXECUTE FUNCTION bookmarks_search_vector_update();

UPDATE bookmarks
SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, ''))
WHERE search_vector IS NULL;

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
