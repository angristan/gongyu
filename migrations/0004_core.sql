PRAGMA foreign_keys = ON;

CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_url TEXT NOT NULL UNIQUE,
    shaarli_short_url TEXT UNIQUE,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    thumbnail_key TEXT,
    deletion_state TEXT NOT NULL DEFAULT 'active'
        CHECK (deletion_state IN ('active', 'pending')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX bookmarks_created_at_idx
ON bookmarks(deletion_state, created_at DESC, id DESC);

CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
    title,
    description,
    url,
    content = 'bookmarks',
    content_rowid = 'id'
);

CREATE TRIGGER bookmarks_after_insert
AFTER INSERT ON bookmarks
BEGIN
    INSERT INTO bookmarks_fts(rowid, title, description, url)
    VALUES (new.id, new.title, new.description, new.url);
END;

CREATE TRIGGER bookmarks_after_update
AFTER UPDATE OF title, description, url ON bookmarks
BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, url)
    VALUES ('delete', old.id, old.title, old.description, old.url);
    INSERT INTO bookmarks_fts(rowid, title, description, url)
    VALUES (new.id, new.title, new.description, new.url);
END;

CREATE TRIGGER bookmarks_after_delete
AFTER DELETE ON bookmarks
BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, url)
    VALUES ('delete', old.id, old.title, old.description, old.url);
END;

CREATE TABLE passkeys (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    user_id TEXT NOT NULL UNIQUE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports_json TEXT NOT NULL,
    credential_device_type TEXT NOT NULL,
    credential_backed_up INTEGER NOT NULL CHECK (credential_backed_up IN (0, 1)),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
);

INSERT INTO passkeys (
    singleton_id,
    user_id,
    credential_id,
    public_key,
    counter,
    transports_json,
    credential_device_type,
    credential_backed_up,
    created_at,
    last_used_at
)
SELECT
    singleton_id,
    user_id,
    credential_id,
    public_key,
    counter,
    transports_json,
    credential_device_type,
    credential_backed_up,
    created_at,
    last_used_at
FROM phase0_passkey;

CREATE TABLE webauthn_challenges (
    id TEXT PRIMARY KEY,
    ceremony TEXT NOT NULL
        CHECK (ceremony IN ('registration', 'authentication')),
    registration_mode TEXT
        CHECK (registration_mode IN ('setup', 'replacement')),
    challenge TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX webauthn_challenges_lookup_idx
ON webauthn_challenges(ceremony, expires_at, consumed_at);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    csrf_token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    idle_expires_at INTEGER NOT NULL,
    absolute_expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_expiry_idx
ON sessions(idle_expires_at, absolute_expires_at);

CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    bookmark_short_url TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('metadata', 'social', 'thumbnail_delete')),
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'claimed', 'completed', 'failed')),
    claim_token TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    payload_version INTEGER NOT NULL,
    last_error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (bookmark_short_url)
        REFERENCES bookmarks(short_url)
        ON DELETE CASCADE
);

CREATE INDEX outbox_claimable_idx
ON outbox(state, lease_expires_at, created_at);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    outbox_id TEXT NOT NULL UNIQUE,
    bookmark_short_url TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN (
            'queued',
            'processing',
            'completed',
            'retrying',
            'needs_review',
            'failed'
        )),
    lease_token TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    payload_version INTEGER NOT NULL,
    last_error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (outbox_id) REFERENCES outbox(id) ON DELETE CASCADE,
    FOREIGN KEY (bookmark_short_url)
        REFERENCES bookmarks(short_url)
        ON DELETE CASCADE
);

CREATE INDEX jobs_claimable_idx
ON jobs(state, lease_expires_at, created_at);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    encrypted_value TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    details_json TEXT NOT NULL
);
