PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS bookmarks_preview_backfill_idx;
DROP TABLE IF EXISTS preview_backfill_items;
DROP TABLE IF EXISTS preview_backfill_runs;
