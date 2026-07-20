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
        CHECK (format IN ('gongyu_json', 'netscape_html', 'shaarli_datastore', 'shaarli_api', 'full_backup')),
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
    updated_at INTEGER NOT NULL
);

INSERT INTO app_state (singleton_id, read_only, reason, updated_at)
VALUES (1, 0, NULL, 0);

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
