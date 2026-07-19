CREATE TABLE phase0_workflow_runs (
    instance_id TEXT PRIMARY KEY,
    payload_version INTEGER NOT NULL,
    operation TEXT NOT NULL,
    object_key TEXT NOT NULL,
    object_etag TEXT NOT NULL,
    object_size INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('complete')),
    completed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX phase0_workflow_runs_object_idx
ON phase0_workflow_runs(object_key, object_etag);
