PRAGMA foreign_keys = ON;

CREATE TABLE phase0_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE phase0_bookmarks_fts USING fts5(
    title,
    content = 'phase0_bookmarks',
    content_rowid = 'id'
);

CREATE TRIGGER phase0_bookmarks_after_insert
AFTER INSERT ON phase0_bookmarks
BEGIN
    INSERT INTO phase0_bookmarks_fts(rowid, title)
    VALUES (new.id, new.title);
END;

CREATE TRIGGER phase0_bookmarks_after_update
AFTER UPDATE OF title ON phase0_bookmarks
BEGIN
    INSERT INTO phase0_bookmarks_fts(phase0_bookmarks_fts, rowid, title)
    VALUES ('delete', old.id, old.title);
    INSERT INTO phase0_bookmarks_fts(rowid, title)
    VALUES (new.id, new.title);
END;

CREATE TRIGGER phase0_bookmarks_after_delete
AFTER DELETE ON phase0_bookmarks
BEGIN
    INSERT INTO phase0_bookmarks_fts(phase0_bookmarks_fts, rowid, title)
    VALUES ('delete', old.id, old.title);
END;

CREATE TABLE phase0_jobs (
    id TEXT PRIMARY KEY,
    bookmark_short_url TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'completed')),
    lease_token TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    payload_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (bookmark_short_url)
        REFERENCES phase0_bookmarks(short_url)
        ON DELETE CASCADE
);

CREATE INDEX phase0_jobs_claimable_idx
ON phase0_jobs(state, lease_expires_at, created_at);
