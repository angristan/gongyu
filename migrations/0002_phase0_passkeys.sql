CREATE TABLE phase0_passkey (
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

CREATE TABLE phase0_webauthn_challenges (
    id TEXT PRIMARY KEY,
    ceremony TEXT NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
    challenge TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX phase0_webauthn_challenges_lookup_idx
ON phase0_webauthn_challenges(ceremony, expires_at, consumed_at);
