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
    updated_at INTEGER NOT NULL,
    metadata_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (metadata_state IN ('pending', 'completed', 'failed')),
    metadata_error_code TEXT,
    metadata_attempted_at INTEGER,
    thumbnail_content_type TEXT,
    thumbnail_size INTEGER,
    thumbnail_width INTEGER,
    thumbnail_height INTEGER,
    thumbnail_sha256 TEXT,
    thumbnail_cleanup_key TEXT
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
    payload_json TEXT,
    available_at INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
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
    payload_json TEXT,
    available_at INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
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

CREATE TABLE social_deliveries (
    id TEXT PRIMARY KEY,
    bookmark_short_url TEXT NOT NULL,
    provider TEXT NOT NULL
        CHECK (provider IN ('twitter', 'mastodon', 'bluesky')),
    state TEXT NOT NULL
        CHECK (state IN (
            'waiting_metadata',
            'queued',
            'processing',
            'delivered',
            'retrying',
            'needs_review',
            'failed'
        )),
    formatting_version INTEGER NOT NULL,
    source_json TEXT NOT NULL,
    payload_json TEXT,
    lease_token TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at INTEGER NOT NULL DEFAULT 0,
    remote_id TEXT,
    last_error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (bookmark_short_url, provider, formatting_version),
    FOREIGN KEY (bookmark_short_url)
        REFERENCES bookmarks(short_url)
        ON DELETE CASCADE
);

CREATE INDEX social_deliveries_claimable_idx
ON social_deliveries(state, lease_expires_at, created_at);

CREATE TABLE data_runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL
        CHECK (kind IN ('import', 'export', 'backup', 'restore')),
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN (
            'pending',
            'running',
            'completed',
            'failed',
            'expired'
        )),
    format TEXT
        CHECK (format IN (
            'gongyu_json',
            'netscape_html',
            'shaarli_datastore',
            'shaarli_api',
            'full_backup'
        )),
    mode TEXT
        CHECK (mode IN ('merge', 'replacement')),
    payload_version INTEGER NOT NULL,
    source_key TEXT,
    source_etag TEXT,
    source_size INTEGER,
    source_sha256 TEXT,
    artifact_key TEXT,
    checkpoint INTEGER NOT NULL DEFAULT 0,
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    skipped_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    error_code TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX data_runs_recent_idx
ON data_runs(created_at DESC);

CREATE INDEX data_runs_expiry_idx
ON data_runs(state, expires_at);

CREATE TABLE data_run_errors (
    run_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, row_index, code),
    FOREIGN KEY (run_id) REFERENCES data_runs(id) ON DELETE CASCADE
);

CREATE TABLE app_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
    reason TEXT,
    updated_at INTEGER NOT NULL,
    recovery_write INTEGER NOT NULL DEFAULT 0
        CHECK (recovery_write IN (0, 1))
);

INSERT INTO app_state (
    singleton_id,
    read_only,
    reason,
    updated_at,
    recovery_write
)
VALUES (1, 0, NULL, 0, 0);

CREATE TABLE restore_bookmarks_staging (
    run_id TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    id INTEGER,
    short_url TEXT NOT NULL,
    shaarli_short_url TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    thumbnail_key TEXT,
    thumbnail_content_type TEXT,
    thumbnail_size INTEGER,
    thumbnail_width INTEGER,
    thumbnail_height INTEGER,
    thumbnail_sha256 TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, source_row),
    FOREIGN KEY (run_id) REFERENCES data_runs(id) ON DELETE CASCADE
);

CREATE TABLE restore_settings_staging (
    run_id TEXT NOT NULL,
    key TEXT NOT NULL,
    encrypted_value TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, key),
    FOREIGN KEY (run_id) REFERENCES data_runs(id) ON DELETE CASCADE
);

CREATE TABLE restore_passkey_staging (
    run_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports_json TEXT NOT NULL,
    credential_device_type TEXT NOT NULL,
    credential_backed_up INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    FOREIGN KEY (run_id) REFERENCES data_runs(id) ON DELETE CASCADE
);

CREATE TABLE write_leases (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE INDEX write_leases_expiry_idx
ON write_leases(expires_at);

CREATE TRIGGER bookmarks_recovery_insert_fence
BEFORE INSERT ON bookmarks
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER bookmarks_recovery_update_fence
BEFORE UPDATE ON bookmarks
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER bookmarks_recovery_delete_fence
BEFORE DELETE ON bookmarks
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER settings_recovery_insert_fence
BEFORE INSERT ON settings
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER settings_recovery_update_fence
BEFORE UPDATE ON settings
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER settings_recovery_delete_fence
BEFORE DELETE ON settings
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER passkeys_recovery_insert_fence
BEFORE INSERT ON passkeys
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER passkeys_recovery_update_fence
BEFORE UPDATE ON passkeys
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;

CREATE TRIGGER passkeys_recovery_delete_fence
BEFORE DELETE ON passkeys
WHEN (
    SELECT read_only = 1 AND recovery_write = 0
    FROM app_state WHERE singleton_id = 1
)
BEGIN
    SELECT RAISE(ABORT, 'recovery_read_only');
END;
