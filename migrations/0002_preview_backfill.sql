PRAGMA foreign_keys = ON;

CREATE TABLE preview_backfill_runs (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
        CHECK (state IN ('running', 'paused', 'completed')),
    active_slot INTEGER UNIQUE
        CHECK (
            (state IN ('running', 'paused') AND active_slot = 1)
            OR (state = 'completed' AND active_slot IS NULL)
        ),
    total_items INTEGER NOT NULL CHECK (total_items >= 0),
    last_admitted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX preview_backfill_runs_recent_idx
ON preview_backfill_runs(created_at DESC);

CREATE TABLE preview_backfill_items (
    run_id TEXT NOT NULL,
    bookmark_short_url TEXT NOT NULL,
    job_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN (
            'pending',
            'queued',
            'previewed',
            'no_preview',
            'failed',
            'skipped'
        )),
    last_error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    PRIMARY KEY (run_id, bookmark_short_url),
    FOREIGN KEY (run_id)
        REFERENCES preview_backfill_runs(id)
        ON DELETE CASCADE
);

CREATE INDEX preview_backfill_items_schedule_idx
ON preview_backfill_items(run_id, state, created_at);

CREATE INDEX bookmarks_preview_backfill_idx
ON bookmarks(created_at DESC, id DESC)
WHERE deletion_state = 'active'
  AND metadata_state = 'completed'
  AND thumbnail_key IS NULL
  AND thumbnail_sha256 IS NULL;
