ALTER TABLE bookmarks
ADD COLUMN metadata_state TEXT NOT NULL DEFAULT 'pending'
CHECK (metadata_state IN ('pending', 'completed', 'failed'));

UPDATE bookmarks
SET metadata_state = 'completed';

ALTER TABLE bookmarks
ADD COLUMN metadata_error_code TEXT;

ALTER TABLE bookmarks
ADD COLUMN metadata_attempted_at INTEGER;

ALTER TABLE bookmarks
ADD COLUMN thumbnail_content_type TEXT;

ALTER TABLE bookmarks
ADD COLUMN thumbnail_size INTEGER;

ALTER TABLE bookmarks
ADD COLUMN thumbnail_width INTEGER;

ALTER TABLE bookmarks
ADD COLUMN thumbnail_height INTEGER;

ALTER TABLE bookmarks
ADD COLUMN thumbnail_sha256 TEXT;

ALTER TABLE outbox
ADD COLUMN payload_json TEXT;

ALTER TABLE outbox
ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE outbox
ADD COLUMN completed_at INTEGER;

ALTER TABLE jobs
ADD COLUMN payload_json TEXT;

ALTER TABLE jobs
ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE jobs
ADD COLUMN completed_at INTEGER;

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
