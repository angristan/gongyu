import {
    BackupBookmark,
    BackupPasskey,
    BackupSetting,
} from '@gongyu/domain/backup';
import { Context, Effect, Schema } from 'effect';
import type { D1Statement, D1Store, D1StoreFailure } from './d1-store';

class ObjectKeyRow extends Schema.Class<ObjectKeyRow>('ObjectKeyRow')({
    key: Schema.String,
}) {}

class RunStateRow extends Schema.Class<RunStateRow>('RunStateRow')({
    state: Schema.String,
}) {}

export interface BackupSnapshot {
    readonly bookmarks: ReadonlyArray<BackupBookmark>;
    readonly passkey: BackupPasskey | null;
    readonly settings: ReadonlyArray<BackupSetting>;
}

export interface BackupRepositoryShape {
    readonly cleanupStage: (
        runId: string,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly cutover: (input: {
        readonly mode: 'merge' | 'replacement';
        readonly now: number;
        readonly restorePasskey: boolean;
        readonly runId: string;
    }) => Effect.Effect<void, D1StoreFailure>;
    readonly snapshot: Effect.Effect<BackupSnapshot, D1StoreFailure>;
    readonly listOwnedObjectKeys: Effect.Effect<
        ReadonlyArray<string>,
        D1StoreFailure
    >;
    readonly stageBookmarks: (
        runId: string,
        startIndex: number,
        bookmarks: ReadonlyArray<BackupBookmark>,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly stagePasskey: (
        runId: string,
        passkey: BackupPasskey | null,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly stageSettings: (
        runId: string,
        settings: ReadonlyArray<BackupSetting>,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly unownedObjectKeys: (
        keys: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<string>, D1StoreFailure>;
}

export class BackupRepository extends Context.Service<
    BackupRepository,
    BackupRepositoryShape
>()('@gongyu/data/BackupRepository') {}

export function makeBackupRepository(
    d1Store: D1Store['Service'],
): BackupRepositoryShape {
    const snapshot = Effect.gen(function* () {
        const [bookmarks, settings, passkey] = yield* Effect.all([
            d1Store.query(
                BackupBookmark,
                `
                    SELECT
                        id,
                        short_url AS "shortUrl",
                        shaarli_short_url AS "shaarliShortUrl",
                        url,
                        title,
                        description,
                        thumbnail_url AS "thumbnailUrl",
                        thumbnail_key AS "thumbnailKey",
                        thumbnail_content_type AS "thumbnailContentType",
                        thumbnail_size AS "thumbnailSize",
                        thumbnail_width AS "thumbnailWidth",
                        thumbnail_height AS "thumbnailHeight",
                        thumbnail_sha256 AS "thumbnailSha256",
                        created_at AS "createdAt",
                        updated_at AS "updatedAt"
                    FROM bookmarks
                    WHERE deletion_state = 'active'
                    ORDER BY id
                `,
            ),
            d1Store.query(
                BackupSetting,
                `
                    SELECT
                        key,
                        encrypted_value AS "encryptedValue",
                        updated_at AS "updatedAt"
                    FROM settings
                    ORDER BY key
                `,
            ),
            d1Store.first(
                BackupPasskey,
                `
                    SELECT
                        user_id AS "userId",
                        credential_id AS "credentialId",
                        lower(hex(public_key)) AS "publicKeyHex",
                        counter,
                        transports_json AS "transportsJson",
                        credential_device_type AS "credentialDeviceType",
                        credential_backed_up AS "credentialBackedUp",
                        created_at AS "createdAt",
                        last_used_at AS "lastUsedAt"
                    FROM passkeys
                    WHERE singleton_id = 1
                `,
            ),
        ]);
        return {
            bookmarks: bookmarks.rows,
            passkey,
            settings: settings.rows,
        };
    }).pipe(Effect.withSpan('BackupRepository.snapshot'));

    const stageBookmarks = Effect.fn('BackupRepository.stageBookmarks')(
        function* (
            runId: string,
            startIndex: number,
            bookmarks: ReadonlyArray<BackupBookmark>,
        ) {
            const statements: D1Statement[] = bookmarks.map(
                (bookmark, offset) => ({
                    sql: `
                        INSERT OR REPLACE INTO restore_bookmarks_staging (
                            run_id, source_row, id, short_url,
                            shaarli_short_url, url, title, description,
                            thumbnail_url, thumbnail_key,
                            thumbnail_content_type, thumbnail_size,
                            thumbnail_width, thumbnail_height, thumbnail_sha256,
                            created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    parameters: [
                        runId,
                        startIndex + offset,
                        bookmark.id,
                        bookmark.shortUrl,
                        bookmark.shaarliShortUrl,
                        bookmark.url,
                        bookmark.title,
                        bookmark.description,
                        bookmark.thumbnailUrl,
                        bookmark.thumbnailKey,
                        bookmark.thumbnailContentType,
                        bookmark.thumbnailSize,
                        bookmark.thumbnailWidth,
                        bookmark.thumbnailHeight,
                        bookmark.thumbnailSha256,
                        bookmark.createdAt,
                        bookmark.updatedAt,
                    ],
                }),
            );
            yield* d1Store.batch(statements);
        },
    );

    const stageSettings = Effect.fn('BackupRepository.stageSettings')(
        function* (runId: string, settings: ReadonlyArray<BackupSetting>) {
            yield* d1Store.batch(
                settings.map((setting) => ({
                    sql: `
                        INSERT OR REPLACE INTO restore_settings_staging (
                            run_id, key, encrypted_value, updated_at
                        )
                        VALUES (?, ?, ?, ?)
                    `,
                    parameters: [
                        runId,
                        setting.key,
                        setting.encryptedValue,
                        setting.updatedAt,
                    ],
                })),
            );
        },
    );

    const stagePasskey = Effect.fn('BackupRepository.stagePasskey')(function* (
        runId: string,
        passkey: BackupPasskey | null,
    ) {
        yield* d1Store.run(
            'DELETE FROM restore_passkey_staging WHERE run_id = ?',
            [runId],
        );
        if (passkey === null) {
            return;
        }
        yield* d1Store.run(
            `
                    INSERT INTO restore_passkey_staging (
                        run_id, user_id, credential_id, public_key,
                        counter, transports_json, credential_device_type,
                        credential_backed_up, created_at, last_used_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
            [
                runId,
                passkey.userId,
                passkey.credentialId,
                Uint8Array.from(
                    passkey.publicKeyHex.match(/.{2}/gu) ?? [],
                    (byte) => Number.parseInt(byte, 16),
                ),
                passkey.counter,
                passkey.transportsJson,
                passkey.credentialDeviceType,
                passkey.credentialBackedUp,
                passkey.createdAt,
                passkey.lastUsedAt,
            ],
        );
    });

    const listOwnedObjectKeys = d1Store
        .query(
            ObjectKeyRow,
            `
                SELECT thumbnail_key AS key
                FROM bookmarks
                WHERE thumbnail_key IS NOT NULL
                UNION
                SELECT thumbnail_cleanup_key AS key
                FROM bookmarks
                WHERE thumbnail_cleanup_key IS NOT NULL
            `,
        )
        .pipe(
            Effect.map((result) => result.rows.map((row) => row.key)),
            Effect.withSpan('BackupRepository.listOwnedObjectKeys'),
        );

    const unownedObjectKeys = Effect.fn('BackupRepository.unownedObjectKeys')(
        function* (keys: ReadonlyArray<string>) {
            if (keys.length === 0) {
                return [];
            }
            const result = yield* d1Store.query(
                ObjectKeyRow,
                `
                SELECT candidate.value AS key
                FROM json_each(?) AS candidate
                WHERE NOT EXISTS (
                    SELECT 1 FROM bookmarks
                    WHERE thumbnail_key = candidate.value
                       OR thumbnail_cleanup_key = candidate.value
                )
            `,
                [JSON.stringify(keys)],
            );
            return result.rows.map((row) => row.key);
        },
    );

    const cleanupStage = Effect.fn('BackupRepository.cleanupStage')(function* (
        runId: string,
    ) {
        yield* d1Store.batch([
            {
                sql: 'DELETE FROM restore_bookmarks_staging WHERE run_id = ?',
                parameters: [runId],
            },
            {
                sql: 'DELETE FROM restore_settings_staging WHERE run_id = ?',
                parameters: [runId],
            },
            {
                sql: 'DELETE FROM restore_passkey_staging WHERE run_id = ?',
                parameters: [runId],
            },
        ]);
    });

    const cutover = Effect.fn('BackupRepository.cutover')(function* (input: {
        readonly mode: 'merge' | 'replacement';
        readonly now: number;
        readonly restorePasskey: boolean;
        readonly runId: string;
    }) {
        const run = yield* d1Store.first(
            RunStateRow,
            'SELECT state FROM data_runs WHERE id = ?',
            [input.runId],
        );
        if (run?.state === 'completed') {
            return;
        }
        if (run?.state !== 'running') {
            return yield* Effect.die(
                new Error('Restore run is not active for cutover.'),
            );
        }
        const statements: D1Statement[] = [
            {
                sql: `
                    UPDATE app_state
                    SET recovery_write = 1, updated_at = ?
                    WHERE singleton_id = 1 AND reason = ?
                `,
                parameters: [input.now, `restore:${input.runId}`],
            },
        ];
        if (input.mode === 'replacement') {
            statements.push({ sql: 'DELETE FROM bookmarks' });
        } else {
            statements.push({
                sql: `
                    INSERT OR IGNORE INTO data_run_errors (
                        run_id, row_index, code, message, created_at
                    )
                    SELECT
                        staged.run_id,
                        staged.source_row,
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks WHERE url = staged.url
                            ) THEN 'duplicate_url'
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks WHERE id = staged.id
                            ) THEN 'id_collision'
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE short_url = staged.short_url
                            ) THEN 'short_url_collision'
                            ELSE 'shaarli_short_url_collision'
                        END,
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks WHERE url = staged.url
                            ) THEN 'Exact URL already exists.'
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks WHERE id = staged.id
                            ) THEN 'Bookmark ID is already used by another URL.'
                            WHEN EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE short_url = staged.short_url
                            ) THEN 'Short URL is already used by another bookmark.'
                            ELSE 'Shaarli short URL is already used by another bookmark.'
                        END,
                        ?
                    FROM restore_bookmarks_staging AS staged
                    WHERE staged.run_id = ?
                      AND (
                        EXISTS (SELECT 1 FROM bookmarks WHERE url = staged.url)
                        OR EXISTS (SELECT 1 FROM bookmarks WHERE id = staged.id)
                        OR EXISTS (
                            SELECT 1 FROM bookmarks
                            WHERE short_url = staged.short_url
                        )
                        OR (
                            staged.shaarli_short_url IS NOT NULL
                            AND EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE shaarli_short_url = staged.shaarli_short_url
                            )
                        )
                      )
                `,
                parameters: [input.now, input.runId],
            });
        }
        statements.push({
            sql: `
                UPDATE data_runs
                SET
                    total_rows = (
                        SELECT COUNT(*) FROM restore_bookmarks_staging
                        WHERE run_id = ?
                    ),
                    processed_rows = (
                        SELECT COUNT(*) FROM restore_bookmarks_staging
                        WHERE run_id = ?
                    ),
                    imported_rows = CASE
                        WHEN ? = 'replacement' THEN (
                            SELECT COUNT(*) FROM restore_bookmarks_staging
                            WHERE run_id = ?
                        )
                        ELSE (
                            SELECT COUNT(*) FROM restore_bookmarks_staging
                            WHERE run_id = ?
                        ) - (
                            SELECT COUNT(*) FROM data_run_errors
                            WHERE run_id = ?
                        )
                    END,
                    skipped_rows = (
                        SELECT COUNT(*) FROM data_run_errors
                        WHERE run_id = ? AND code = 'duplicate_url'
                    ),
                    error_rows = (
                        SELECT COUNT(*) FROM data_run_errors
                        WHERE run_id = ? AND code <> 'duplicate_url'
                    ),
                    updated_at = ?
                WHERE id = ?
            `,
            parameters: [
                input.runId,
                input.runId,
                input.mode,
                input.runId,
                input.runId,
                input.runId,
                input.runId,
                input.runId,
                input.now,
                input.runId,
            ],
        });
        statements.push({
            sql: `
                INSERT INTO bookmarks (
                    id, short_url, shaarli_short_url, url, title, description,
                    thumbnail_url, thumbnail_key, thumbnail_content_type,
                    thumbnail_size, thumbnail_width, thumbnail_height,
                    thumbnail_sha256, metadata_state, deletion_state,
                    created_at, updated_at
                )
                SELECT
                    staged.id,
                    staged.short_url,
                    staged.shaarli_short_url,
                    staged.url,
                    staged.title,
                    staged.description,
                    staged.thumbnail_url,
                    staged.thumbnail_key,
                    staged.thumbnail_content_type,
                    staged.thumbnail_size,
                    staged.thumbnail_width,
                    staged.thumbnail_height,
                    staged.thumbnail_sha256,
                    'completed',
                    'active',
                    staged.created_at,
                    staged.updated_at
                FROM restore_bookmarks_staging AS staged
                WHERE staged.run_id = ?
                  AND (
                    ? = 'replacement'
                    OR (
                        NOT EXISTS (SELECT 1 FROM bookmarks WHERE url = staged.url)
                        AND NOT EXISTS (SELECT 1 FROM bookmarks WHERE id = staged.id)
                        AND NOT EXISTS (
                            SELECT 1 FROM bookmarks WHERE short_url = staged.short_url
                        )
                        AND (
                            staged.shaarli_short_url IS NULL
                            OR NOT EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE shaarli_short_url = staged.shaarli_short_url
                            )
                        )
                    )
                  )
            `,
            parameters: [input.runId, input.mode],
        });
        statements.push(
            { sql: 'DELETE FROM settings' },
            {
                sql: `
                    INSERT INTO settings (key, encrypted_value, updated_at)
                    SELECT key, encrypted_value, updated_at
                    FROM restore_settings_staging
                    WHERE run_id = ?
                `,
                parameters: [input.runId],
            },
        );
        if (input.mode === 'replacement' && input.restorePasskey) {
            statements.push(
                { sql: 'DELETE FROM passkeys' },
                {
                    sql: `
                        INSERT INTO passkeys (
                            singleton_id, user_id, credential_id, public_key,
                            counter, transports_json, credential_device_type,
                            credential_backed_up, created_at, last_used_at
                        )
                        SELECT
                            1, user_id, credential_id, public_key,
                            counter, transports_json, credential_device_type,
                            credential_backed_up, created_at, last_used_at
                        FROM restore_passkey_staging
                        WHERE run_id = ?
                    `,
                    parameters: [input.runId],
                },
            );
        }
        statements.push(
            { sql: 'DELETE FROM sessions' },
            { sql: 'DELETE FROM webauthn_challenges' },
            {
                sql: `
                    INSERT INTO bookmarks_fts(bookmarks_fts)
                    VALUES ('rebuild')
                `,
            },
            {
                sql: `
                    UPDATE app_state
                    SET read_only = 0,
                        recovery_write = 0,
                        reason = NULL,
                        updated_at = ?
                    WHERE singleton_id = 1
                `,
                parameters: [input.now],
            },
            {
                sql: `
                    UPDATE data_runs
                    SET state = 'completed',
                        completed_at = ?,
                        updated_at = ?,
                        error_code = NULL
                    WHERE id = ? AND state = 'running'
                `,
                parameters: [input.now, input.now, input.runId],
            },
            {
                sql: `
                    INSERT INTO audit_log (id, event, occurred_at, details_json)
                    VALUES (?, 'data_restored', ?, ?)
                `,
                parameters: [
                    crypto.randomUUID(),
                    input.now,
                    JSON.stringify({ mode: input.mode, runId: input.runId }),
                ],
            },
        );
        yield* d1Store.batch(statements);
    });

    return {
        cleanupStage,
        cutover,
        listOwnedObjectKeys,
        snapshot,
        stageBookmarks,
        stagePasskey,
        stageSettings,
        unownedObjectKeys,
    };
}
