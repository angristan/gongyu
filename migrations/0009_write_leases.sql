CREATE TABLE write_leases (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE INDEX write_leases_expiry_idx
ON write_leases(expires_at);
