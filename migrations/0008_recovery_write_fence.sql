ALTER TABLE app_state
ADD COLUMN recovery_write INTEGER NOT NULL DEFAULT 0
CHECK (recovery_write IN (0, 1));

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
