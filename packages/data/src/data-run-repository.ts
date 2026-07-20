import { PortableBookmark } from '@gongyu/domain/portability';
import { Context, Effect, Schema } from 'effect';
import type { D1Statement, D1Store, D1StoreFailure } from './d1-store';

export class DataRunBusyError extends Schema.TaggedErrorClass<DataRunBusyError>()(
    'DataRunBusyError',
    {},
) {}

export class ReadOnlyError extends Schema.TaggedErrorClass<ReadOnlyError>()(
    'ReadOnlyError',
    { reason: Schema.NullOr(Schema.String) },
) {}

export class DataRunError extends Schema.Class<DataRunError>('DataRunError')({
    code: Schema.String,
    message: Schema.String,
    rowIndex: Schema.Number,
}) {}

export class ExpiredArtifact extends Schema.Class<ExpiredArtifact>(
    'ExpiredArtifact',
)({
    artifactKey: Schema.String,
    id: Schema.String,
    kind: Schema.String,
}) {}

export class DataRun extends Schema.Class<DataRun>('DataRun')({
    artifactKey: Schema.NullOr(Schema.String),
    checkpoint: Schema.Number,
    checksum: Schema.NullOr(Schema.String),
    completedAt: Schema.NullOr(Schema.Number),
    createdAt: Schema.Number,
    errorCode: Schema.NullOr(Schema.String),
    errorRows: Schema.Number,
    expiresAt: Schema.NullOr(Schema.Number),
    format: Schema.NullOr(Schema.String),
    id: Schema.String,
    importedRows: Schema.Number,
    kind: Schema.String,
    mode: Schema.NullOr(Schema.String),
    processedRows: Schema.Number,
    skippedRows: Schema.Number,
    sourceEtag: Schema.NullOr(Schema.String),
    sourceKey: Schema.NullOr(Schema.String),
    sourceSha256: Schema.NullOr(Schema.String),
    sourceSize: Schema.NullOr(Schema.Number),
    state: Schema.String,
    totalRows: Schema.Number,
    updatedAt: Schema.Number,
}) {}

export interface ImportChunkOutcome {
    readonly errorRows: number;
    readonly importedRows: number;
    readonly nextCheckpoint: number;
    readonly skippedRows: number;
}

interface ImportError {
    readonly code: string;
    readonly message: string;
    readonly rowIndex: number;
}

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}

class ExistingBookmark extends Schema.Class<ExistingBookmark>(
    'ExistingBookmark',
)({
    id: Schema.Number,
    shaarliShortUrl: Schema.NullOr(Schema.String),
    shortUrl: Schema.String,
    url: Schema.String,
}) {}

export class AppStateRow extends Schema.Class<AppStateRow>('AppStateRow')({
    readOnly: Schema.Number,
    reason: Schema.NullOr(Schema.String),
}) {}

export interface DataRunRepositoryShape {
    readonly assertWritable: Effect.Effect<
        void,
        ReadOnlyError | D1StoreFailure
    >;
    readonly countProcessingJobs: (
        now: number,
    ) => Effect.Effect<number, D1StoreFailure>;
    readonly completeRun: (input: {
        readonly artifactKey: string | null;
        readonly checksum: string | null;
        readonly expiresAt: number | null;
        readonly now: number;
        readonly runId: string;
    }) => Effect.Effect<void, D1StoreFailure>;
    readonly createRun: (input: {
        readonly format: string | null;
        readonly id: string;
        readonly kind: string;
        readonly mode: string | null;
        readonly now: number;
        readonly sourceEtag: string | null;
        readonly sourceKey: string | null;
        readonly sourceSha256: string | null;
        readonly sourceSize: number | null;
    }) => Effect.Effect<void, DataRunBusyError | D1StoreFailure>;
    readonly expireRun: (
        runId: string,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly failRun: (
        runId: string,
        errorCode: string,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly getRun: (
        runId: string,
    ) => Effect.Effect<DataRun | null, D1StoreFailure>;
    readonly getAppState: Effect.Effect<AppStateRow, D1StoreFailure>;
    readonly importChunk: (input: {
        readonly errors: ReadonlyArray<ImportError>;
        readonly now: number;
        readonly rows: ReadonlyArray<PortableBookmark>;
        readonly runId: string;
        readonly startIndex: number;
        readonly totalRows: number;
    }) => Effect.Effect<ImportChunkOutcome, D1StoreFailure>;
    readonly listBookmarks: Effect.Effect<
        ReadonlyArray<PortableBookmark>,
        D1StoreFailure
    >;
    readonly listErrors: (
        runId: string,
        limit: number,
    ) => Effect.Effect<ReadonlyArray<DataRunError>, D1StoreFailure>;
    readonly listExpiredArtifacts: (
        now: number,
        limit: number,
    ) => Effect.Effect<ReadonlyArray<ExpiredArtifact>, D1StoreFailure>;
    readonly listRuns: (
        limit: number,
    ) => Effect.Effect<ReadonlyArray<DataRun>, D1StoreFailure>;
    readonly releaseReadOnly: (
        reason: string,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly setReadOnly: (
        readOnly: boolean,
        reason: string | null,
        now: number,
    ) => Effect.Effect<void, DataRunBusyError | D1StoreFailure>;
    readonly startRun: (
        runId: string,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
}

export class DataRunRepository extends Context.Service<
    DataRunRepository,
    DataRunRepositoryShape
>()('@gongyu/data/DataRunRepository') {}

function projection(): string {
    return `
        SELECT
            id,
            kind,
            state,
            format,
            mode,
            source_key AS "sourceKey",
            source_etag AS "sourceEtag",
            source_size AS "sourceSize",
            source_sha256 AS "sourceSha256",
            artifact_key AS "artifactKey",
            checkpoint,
            total_rows AS "totalRows",
            processed_rows AS "processedRows",
            imported_rows AS "importedRows",
            skipped_rows AS "skippedRows",
            error_rows AS "errorRows",
            checksum,
            error_code AS "errorCode",
            expires_at AS "expiresAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            completed_at AS "completedAt"
        FROM data_runs
    `;
}

function randomShortUrl(): string {
    const alphabet =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(
        '',
    );
}

export function makeDataRunRepository(
    d1Store: D1Store['Service'],
): DataRunRepositoryShape {
    const getAppState = d1Store
        .first(
            AppStateRow,
            `
                SELECT read_only AS "readOnly", reason
                FROM app_state
                WHERE singleton_id = 1
            `,
        )
        .pipe(
            Effect.map(
                (state) =>
                    state ?? AppStateRow.make({ readOnly: 0, reason: null }),
            ),
            Effect.withSpan('DataRunRepository.getAppState'),
        );

    const assertWritable = getAppState.pipe(
        Effect.flatMap((state) =>
            state.readOnly === 1
                ? ReadOnlyError.make({ reason: state.reason })
                : Effect.void,
        ),
        Effect.withSpan('DataRunRepository.assertWritable'),
    );

    const countProcessingJobs = Effect.fn(
        'DataRunRepository.countProcessingJobs',
    )(function* (now: number) {
        yield* d1Store.run('DELETE FROM write_leases WHERE expires_at <= ?', [
            now,
        ]);
        const row = yield* d1Store.first(
            CountRow,
            `
                SELECT
                    (
                        SELECT COUNT(*) FROM jobs
                        WHERE state = 'processing' AND lease_expires_at > ?
                    ) + (
                        SELECT COUNT(*) FROM write_leases
                        WHERE expires_at > ?
                    ) AS count
            `,
            [now, now],
        );
        return row?.count ?? 0;
    });

    const createRun = Effect.fn('DataRunRepository.createRun')(
        function* (input: {
            readonly format: string | null;
            readonly id: string;
            readonly kind: string;
            readonly mode: string | null;
            readonly now: number;
            readonly sourceEtag: string | null;
            readonly sourceKey: string | null;
            readonly sourceSha256: string | null;
            readonly sourceSize: number | null;
        }) {
            const result = yield* d1Store.run(
                `
                    INSERT INTO data_runs (
                        id, kind, state, format, mode, payload_version,
                        source_key, source_etag, source_size, source_sha256,
                        created_at, updated_at
                    )
                    SELECT ?, ?, 'pending', ?, ?, 1, ?, ?, ?, ?, ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM data_runs
                        WHERE state IN ('pending', 'running')
                    )
                `,
                [
                    input.id,
                    input.kind,
                    input.format,
                    input.mode,
                    input.sourceKey,
                    input.sourceEtag,
                    input.sourceSize,
                    input.sourceSha256,
                    input.now,
                    input.now,
                ],
            );
            if (result.changes !== 1) {
                return yield* DataRunBusyError.make({});
            }
        },
    );

    const startRun = Effect.fn('DataRunRepository.startRun')(function* (
        runId: string,
        now: number,
    ) {
        yield* d1Store.run(
            `
                    UPDATE data_runs
                    SET state = 'running', updated_at = ?
                    WHERE id = ? AND state IN ('pending', 'running')
                `,
            [now, runId],
        );
    });

    const completeRun = Effect.fn('DataRunRepository.completeRun')(
        function* (input: {
            readonly artifactKey: string | null;
            readonly checksum: string | null;
            readonly expiresAt: number | null;
            readonly now: number;
            readonly runId: string;
        }) {
            yield* d1Store.run(
                `
                    UPDATE data_runs
                    SET
                        state = 'completed',
                        artifact_key = ?,
                        checksum = ?,
                        expires_at = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                `,
                [
                    input.artifactKey,
                    input.checksum,
                    input.expiresAt,
                    input.now,
                    input.now,
                    input.runId,
                ],
            );
        },
    );

    const expireRun = Effect.fn('DataRunRepository.expireRun')(function* (
        runId: string,
        now: number,
    ) {
        yield* d1Store.run(
            `
                    UPDATE data_runs
                    SET state = 'expired', artifact_key = NULL, updated_at = ?
                    WHERE id = ? AND state = 'completed'
                `,
            [now, runId],
        );
    });

    const failRun = Effect.fn('DataRunRepository.failRun')(function* (
        runId: string,
        errorCode: string,
        now: number,
    ) {
        yield* d1Store.run(
            `
                    UPDATE data_runs
                    SET
                        state = 'failed',
                        error_code = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state IN ('pending', 'running')
                `,
            [errorCode, now, now, runId],
        );
    });

    const getRun = Effect.fn('DataRunRepository.getRun')((runId: string) =>
        d1Store.first(DataRun, `${projection()} WHERE id = ?`, [runId]),
    );

    const listErrors = Effect.fn('DataRunRepository.listErrors')(function* (
        runId: string,
        limit: number,
    ) {
        const result = yield* d1Store.query(
            DataRunError,
            `
                    SELECT row_index AS "rowIndex", code, message
                    FROM data_run_errors
                    WHERE run_id = ?
                    ORDER BY row_index, code
                    LIMIT ?
                `,
            [runId, limit],
        );
        return result.rows;
    });

    const listExpiredArtifacts = Effect.fn(
        'DataRunRepository.listExpiredArtifacts',
    )(function* (now: number, limit: number) {
        const result = yield* d1Store.query(
            ExpiredArtifact,
            `
                SELECT id, kind, artifact_key AS "artifactKey"
                FROM data_runs
                WHERE state = 'completed'
                  AND artifact_key IS NOT NULL
                  AND expires_at <= ?
                ORDER BY expires_at
                LIMIT ?
            `,
            [now, limit],
        );
        return result.rows;
    });

    const listRuns = Effect.fn('DataRunRepository.listRuns')(function* (
        limit: number,
    ) {
        const result = yield* d1Store.query(
            DataRun,
            `${projection()} ORDER BY created_at DESC LIMIT ?`,
            [limit],
        );
        return result.rows;
    });

    const listBookmarks = d1Store
        .query(
            PortableBookmark,
            `
                SELECT
                    id,
                    url,
                    title,
                    description,
                    short_url AS "shortUrl",
                    shaarli_short_url AS "shaarliShortUrl",
                    thumbnail_url AS "thumbnailUrl",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt"
                FROM bookmarks
                WHERE deletion_state = 'active'
                ORDER BY created_at DESC, id DESC
            `,
        )
        .pipe(
            Effect.map((result) => result.rows),
            Effect.withSpan('DataRunRepository.listBookmarks'),
        );

    const releaseReadOnly = Effect.fn('DataRunRepository.releaseReadOnly')(
        function* (reason: string, now: number) {
            yield* d1Store.run(
                `
                    UPDATE app_state
                    SET read_only = 0, reason = NULL, updated_at = ?
                    WHERE singleton_id = 1 AND reason = ?
                `,
                [now, reason],
            );
        },
    );

    const setReadOnly = Effect.fn('DataRunRepository.setReadOnly')(function* (
        readOnly: boolean,
        reason: string | null,
        now: number,
    ) {
        const result = yield* d1Store.run(
            `
                    UPDATE app_state
                    SET read_only = ?, reason = ?, updated_at = ?
                    WHERE singleton_id = 1
                      AND (? = 0 OR read_only = 0 OR reason = ?)
                `,
            [readOnly ? 1 : 0, reason, now, readOnly ? 1 : 0, reason],
        );
        if (result.changes !== 1) {
            return yield* DataRunBusyError.make({});
        }
    });

    const importChunk = Effect.fn('DataRunRepository.importChunk')(
        function* (input: {
            readonly errors: ReadonlyArray<ImportError>;
            readonly now: number;
            readonly rows: ReadonlyArray<PortableBookmark>;
            readonly runId: string;
            readonly startIndex: number;
            readonly totalRows: number;
        }) {
            const currentRun = yield* getRun(input.runId);
            if (currentRun === null) {
                return yield* Effect.die(
                    new Error('Import run does not exist.'),
                );
            }
            if (currentRun.checkpoint > input.startIndex) {
                return {
                    errorRows: 0,
                    importedRows: 0,
                    nextCheckpoint: currentRun.checkpoint,
                    skippedRows: 0,
                };
            }
            if (currentRun.checkpoint !== input.startIndex) {
                return yield* Effect.die(
                    new Error('Import chunks must commit in checkpoint order.'),
                );
            }
            const initialShortUrls = input.rows.map(
                (row) => row.shortUrl ?? randomShortUrl(),
            );
            const existingResult = yield* d1Store.query(
                ExistingBookmark,
                `
                    SELECT
                        id,
                        url,
                        short_url AS "shortUrl",
                        shaarli_short_url AS "shaarliShortUrl"
                    FROM bookmarks
                    WHERE url IN (SELECT value FROM json_each(?))
                       OR id IN (SELECT value FROM json_each(?))
                       OR short_url IN (SELECT value FROM json_each(?))
                       OR shaarli_short_url IN (
                            SELECT value FROM json_each(?)
                       )
                `,
                [
                    JSON.stringify(input.rows.map((row) => row.url)),
                    JSON.stringify(
                        input.rows.flatMap((row) =>
                            row.id === null ? [] : [row.id],
                        ),
                    ),
                    JSON.stringify(initialShortUrls),
                    JSON.stringify(
                        input.rows.flatMap((row) =>
                            row.shaarliShortUrl === null
                                ? []
                                : [row.shaarliShortUrl],
                        ),
                    ),
                ],
            );
            const urls = new Set(existingResult.rows.map((row) => row.url));
            const ids = new Map(
                existingResult.rows.map((row) => [row.id, row.url]),
            );
            const shortUrls = new Set(
                existingResult.rows.map((row) => row.shortUrl),
            );
            const shaarliShortUrls = new Set(
                existingResult.rows.flatMap((row) =>
                    row.shaarliShortUrl === null ? [] : [row.shaarliShortUrl],
                ),
            );
            const statements: D1Statement[] = [];
            const errors = [...input.errors];
            let importedRows = 0;
            let skippedRows = 0;

            for (const [offset, row] of input.rows.entries()) {
                const rowIndex = input.startIndex + offset;
                if (urls.has(row.url)) {
                    skippedRows += 1;
                    continue;
                }
                if (row.url.length > 2_048 || row.title.length > 500) {
                    errors.push({
                        code: 'invalid_row',
                        message: 'URL or title exceeds the supported length.',
                        rowIndex,
                    });
                    continue;
                }
                if (row.id !== null && ids.has(row.id)) {
                    errors.push({
                        code: 'id_collision',
                        message: 'Bookmark ID is already used by another URL.',
                        rowIndex,
                    });
                    continue;
                }
                let shortUrl = initialShortUrls[offset] ?? randomShortUrl();
                if (
                    shortUrl !== null &&
                    (!/^[A-Za-z0-9]{8}$/u.test(shortUrl) ||
                        shortUrls.has(shortUrl))
                ) {
                    errors.push({
                        code: 'short_url_collision',
                        message:
                            'Bookmark short URL is invalid or already used.',
                        rowIndex,
                    });
                    continue;
                }
                if (
                    row.shaarliShortUrl !== null &&
                    shaarliShortUrls.has(row.shaarliShortUrl)
                ) {
                    errors.push({
                        code: 'shaarli_short_url_collision',
                        message: 'Shaarli short URL is already used.',
                        rowIndex,
                    });
                    continue;
                }
                while (shortUrls.has(shortUrl)) {
                    shortUrl = randomShortUrl();
                    const collision = yield* d1Store.first(
                        ExistingBookmark,
                        `
                            SELECT
                                id,
                                url,
                                short_url AS "shortUrl",
                                shaarli_short_url AS "shaarliShortUrl"
                            FROM bookmarks
                            WHERE short_url = ?
                        `,
                        [shortUrl],
                    );
                    if (collision !== null) {
                        shortUrls.add(collision.shortUrl);
                    }
                }
                const metadataState =
                    row.thumbnailUrl === null ? 'completed' : 'pending';
                statements.push({
                    sql:
                        row.id === null
                            ? `
                                INSERT INTO bookmarks (
                                    short_url, shaarli_short_url, url, title,
                                    description, thumbnail_url, metadata_state,
                                    deletion_state, created_at, updated_at
                                )
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                            `
                            : `
                                INSERT INTO bookmarks (
                                    id, short_url, shaarli_short_url, url,
                                    title, description, thumbnail_url,
                                    metadata_state, deletion_state,
                                    created_at, updated_at
                                )
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                            `,
                    parameters:
                        row.id === null
                            ? [
                                  shortUrl,
                                  row.shaarliShortUrl,
                                  row.url,
                                  row.title,
                                  row.description,
                                  row.thumbnailUrl,
                                  metadataState,
                                  row.createdAt,
                                  row.updatedAt,
                              ]
                            : [
                                  row.id,
                                  shortUrl,
                                  row.shaarliShortUrl,
                                  row.url,
                                  row.title,
                                  row.description,
                                  row.thumbnailUrl,
                                  metadataState,
                                  row.createdAt,
                                  row.updatedAt,
                              ],
                });
                if (row.thumbnailUrl !== null) {
                    statements.push({
                        sql: `
                            INSERT INTO outbox (
                                id, bookmark_short_url, kind, state,
                                payload_version, available_at, created_at, updated_at
                            )
                            VALUES (?, ?, 'metadata', 'pending', 1, ?, ?, ?)
                        `,
                        parameters: [
                            `metadata:${shortUrl}:import-v1`,
                            shortUrl,
                            input.now,
                            input.now,
                            input.now,
                        ],
                    });
                }
                importedRows += 1;
                urls.add(row.url);
                if (row.id !== null) {
                    ids.set(row.id, row.url);
                }
                shortUrls.add(shortUrl);
                if (row.shaarliShortUrl !== null) {
                    shaarliShortUrls.add(row.shaarliShortUrl);
                }
            }

            for (const item of errors) {
                statements.push({
                    sql: `
                        INSERT OR IGNORE INTO data_run_errors (
                            run_id, row_index, code, message, created_at
                        )
                        VALUES (?, ?, ?, ?, ?)
                    `,
                    parameters: [
                        input.runId,
                        item.rowIndex,
                        item.code,
                        item.message,
                        input.now,
                    ],
                });
            }
            const nextCheckpoint =
                input.startIndex + Math.max(input.rows.length, 1);
            statements.push({
                sql: `
                    UPDATE data_runs
                    SET
                        checkpoint = ?,
                        total_rows = ?,
                        processed_rows = processed_rows + ?,
                        imported_rows = imported_rows + ?,
                        skipped_rows = skipped_rows + ?,
                        error_rows = error_rows + ?,
                        updated_at = ?
                    WHERE id = ? AND checkpoint = ?
                `,
                parameters: [
                    nextCheckpoint,
                    input.totalRows,
                    input.rows.length +
                        errors.filter((item) => item.rowIndex >= 0).length,
                    importedRows,
                    skippedRows,
                    errors.filter((item) => item.rowIndex >= 0).length,
                    input.now,
                    input.runId,
                    input.startIndex,
                ],
            });
            yield* d1Store.batch(statements);
            return {
                errorRows: errors.filter((item) => item.rowIndex >= 0).length,
                importedRows,
                nextCheckpoint,
                skippedRows,
            };
        },
    );

    return {
        assertWritable,
        completeRun,
        countProcessingJobs,
        createRun,
        expireRun,
        failRun,
        getAppState,
        getRun,
        importChunk,
        listBookmarks,
        listErrors,
        listExpiredArtifacts,
        listRuns,
        releaseReadOnly,
        setReadOnly,
        startRun,
    };
}
