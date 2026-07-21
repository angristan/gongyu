import { Context, Effect, Schema } from 'effect';
import type { D1Store, D1StoreFailure } from './d1-store';

const terminalStates = [
    'previewed',
    'no_preview',
    'failed',
    'skipped',
] as const;

export type PreviewBackfillTerminalState = (typeof terminalStates)[number];

export class PreviewBackfillSummary extends Schema.Class<PreviewBackfillSummary>(
    'PreviewBackfillSummary',
)({
    candidateCount: Schema.Number,
    completedAt: Schema.NullOr(Schema.Number),
    failed: Schema.Number,
    id: Schema.NullOr(Schema.String),
    noPreview: Schema.Number,
    pending: Schema.Number,
    previewed: Schema.Number,
    queued: Schema.Number,
    skipped: Schema.Number,
    state: Schema.Union([
        Schema.Literal('idle'),
        Schema.Literal('running'),
        Schema.Literal('paused'),
        Schema.Literal('completed'),
    ]),
    total: Schema.Number,
    updatedAt: Schema.NullOr(Schema.Number),
}) {}

export class PreviewBackfillTarget extends Schema.Class<PreviewBackfillTarget>(
    'PreviewBackfillTarget',
)({
    bookmarkShortUrl: Schema.String,
    jobId: Schema.String,
    runId: Schema.String,
    thumbnailUrl: Schema.NullOr(Schema.String),
    updatedAt: Schema.Number,
    url: Schema.String,
}) {}

class PreviewBackfillItemState extends Schema.Class<PreviewBackfillItemState>(
    'PreviewBackfillItemState',
)({
    state: Schema.Union([
        Schema.Literal('previewed'),
        Schema.Literal('skipped'),
    ]),
}) {}

export interface PreviewBackfillRepositoryShape {
    readonly attachPreview: (input: {
        readonly contentType: string;
        readonly expectedUpdatedAt: number;
        readonly height: number;
        readonly jobId: string;
        readonly key: string;
        readonly now: number;
        readonly sha256: string;
        readonly size: number;
        readonly sourceUrl: string;
        readonly token: string;
        readonly width: number;
    }) => Effect.Effect<'previewed' | 'skipped' | 'stale', D1StoreFailure>;
    readonly deferForMaintenance: (
        jobId: string,
        now: number,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly enqueueBatch: (input: {
        readonly batchLimit: number;
        readonly maxInFlight: number;
        readonly now: number;
    }) => Effect.Effect<number, D1StoreFailure>;
    readonly findTarget: (
        jobId: string,
        bookmarkShortUrl: string,
    ) => Effect.Effect<PreviewBackfillTarget | null, D1StoreFailure>;
    readonly finishItem: (input: {
        readonly errorCode: string | null;
        readonly jobId: string;
        readonly now: number;
        readonly sourceUrl: string | null;
        readonly state: PreviewBackfillTerminalState;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly getSummary: Effect.Effect<PreviewBackfillSummary, D1StoreFailure>;
    readonly isBackfillJob: (jobId: string) => boolean;
    readonly pause: (
        runId: string,
        now: number,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly pruneTerminalHistory: (input: {
        readonly completedBefore: number;
        readonly limit: number;
    }) => Effect.Effect<number, D1StoreFailure>;
    readonly reconcile: (now: number) => Effect.Effect<number, D1StoreFailure>;
    readonly resume: (
        runId: string,
        now: number,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly start: (input: {
        readonly itemLimit: number;
        readonly now: number;
        readonly runId: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly terminalizeItem: (input: {
        readonly errorCode: string;
        readonly jobId: string;
        readonly now: number;
        readonly state: 'failed' | 'skipped';
    }) => Effect.Effect<boolean, D1StoreFailure>;
}

export class PreviewBackfillRepository extends Context.Service<
    PreviewBackfillRepository,
    PreviewBackfillRepositoryShape
>()('@gongyu/data/PreviewBackfillRepository') {}

const completeRunStatement = `
    UPDATE preview_backfill_runs
    SET
        state = 'completed',
        active_slot = NULL,
        completed_at = ?,
        updated_at = ?
    WHERE id = (
        SELECT run_id
        FROM preview_backfill_items
        WHERE job_id = ?
    )
      AND state IN ('running', 'paused')
      AND NOT EXISTS (
        SELECT 1
        FROM preview_backfill_items
        WHERE run_id = preview_backfill_runs.id
          AND state IN ('pending', 'queued')
      )
`;

export function makePreviewBackfillRepository(
    d1Store: D1Store['Service'],
): PreviewBackfillRepositoryShape {
    const getSummary = d1Store
        .first(
            PreviewBackfillSummary,
            `
            WITH latest AS (
                SELECT id, state, updated_at, completed_at, total_items
                FROM preview_backfill_runs
                ORDER BY created_at DESC
                LIMIT 1
            )
            SELECT
                latest.id,
                COALESCE(latest.state, 'idle') AS state,
                latest.updated_at AS "updatedAt",
                latest.completed_at AS "completedAt",
                COALESCE(latest.total_items, 0) AS total,
                COALESCE(SUM(items.state = 'pending'), 0) AS pending,
                COALESCE(SUM(items.state = 'queued'), 0) AS queued,
                COALESCE(SUM(items.state = 'previewed'), 0) AS previewed,
                COALESCE(SUM(items.state = 'no_preview'), 0) AS "noPreview",
                COALESCE(SUM(items.state = 'failed'), 0) AS failed,
                COALESCE(SUM(items.state = 'skipped'), 0) AS skipped,
                (
                    SELECT COUNT(*)
                    FROM bookmarks
                    WHERE deletion_state = 'active'
                      AND metadata_state = 'completed'
                      AND thumbnail_key IS NULL
                      AND thumbnail_sha256 IS NULL
                ) AS "candidateCount"
            FROM (SELECT 1) AS singleton
            LEFT JOIN latest ON 1 = 1
            LEFT JOIN preview_backfill_items AS items
                ON items.run_id = latest.id
        `,
        )
        .pipe(
            Effect.map(
                (summary) =>
                    summary ??
                    PreviewBackfillSummary.make({
                        candidateCount: 0,
                        completedAt: null,
                        failed: 0,
                        id: null,
                        noPreview: 0,
                        pending: 0,
                        previewed: 0,
                        queued: 0,
                        skipped: 0,
                        state: 'idle',
                        total: 0,
                        updatedAt: null,
                    }),
            ),
        );

    const start = Effect.fn('PreviewBackfillRepository.start')(
        function* (input: {
            readonly itemLimit: number;
            readonly now: number;
            readonly runId: string;
        }) {
            const results = yield* d1Store.batch([
                {
                    sql: `
                        INSERT OR IGNORE INTO preview_backfill_runs (
                            id,
                            state,
                            active_slot,
                            total_items,
                            created_at,
                            updated_at,
                            completed_at
                        )
                        SELECT
                            ?,
                            CASE WHEN COUNT(*) = 0 THEN 'completed' ELSE 'running' END,
                            CASE WHEN COUNT(*) = 0 THEN NULL ELSE 1 END,
                            COUNT(*),
                            ?,
                            ?,
                            CASE WHEN COUNT(*) = 0 THEN ? ELSE NULL END
                        FROM (
                            SELECT id
                            FROM bookmarks
                            WHERE deletion_state = 'active'
                              AND metadata_state = 'completed'
                              AND thumbnail_key IS NULL
                              AND thumbnail_sha256 IS NULL
                            ORDER BY created_at DESC, id DESC
                            LIMIT ?
                        ) AS candidates
                        HAVING NOT EXISTS (
                            SELECT 1
                            FROM preview_backfill_runs
                            WHERE active_slot = 1
                        )
                    `,
                    parameters: [
                        input.runId,
                        input.now,
                        input.now,
                        input.now,
                        input.itemLimit,
                    ],
                },
                {
                    sql: `
                        INSERT OR IGNORE INTO preview_backfill_items (
                            run_id,
                            bookmark_short_url,
                            job_id,
                            state,
                            created_at,
                            updated_at
                        )
                        SELECT
                            ?,
                            short_url,
                            'preview-backfill:' || ? || ':' || short_url,
                            'pending',
                            ?,
                            ?
                        FROM bookmarks
                        WHERE deletion_state = 'active'
                          AND metadata_state = 'completed'
                          AND thumbnail_key IS NULL
                          AND thumbnail_sha256 IS NULL
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_runs
                            WHERE id = ? AND state = 'running'
                          )
                        ORDER BY created_at DESC, id DESC
                        LIMIT ?
                    `,
                    parameters: [
                        input.runId,
                        input.runId,
                        input.now,
                        input.now,
                        input.runId,
                        input.itemLimit,
                    ],
                },
            ]);
            return (results[0]?.changes ?? 0) === 1;
        },
    );

    const pause = Effect.fn('PreviewBackfillRepository.pause')(function* (
        runId: string,
        now: number,
    ) {
        const result = yield* d1Store.run(
            `
                    UPDATE preview_backfill_runs
                    SET state = 'paused', updated_at = ?
                    WHERE id = ? AND state = 'running' AND active_slot = 1
                `,
            [now, runId],
        );
        return result.changes === 1;
    });

    const resume = Effect.fn('PreviewBackfillRepository.resume')(function* (
        runId: string,
        now: number,
    ) {
        const result = yield* d1Store.run(
            `
                    UPDATE preview_backfill_runs
                    SET state = 'running', updated_at = ?
                    WHERE id = ? AND state = 'paused' AND active_slot = 1
                `,
            [now, runId],
        );
        return result.changes === 1;
    });

    const pruneTerminalHistory = Effect.fn(
        'PreviewBackfillRepository.pruneTerminalHistory',
    )(function* (input: {
        readonly completedBefore: number;
        readonly limit: number;
    }) {
        const result = yield* d1Store.run(
            `
                DELETE FROM preview_backfill_runs
                WHERE id IN (
                    SELECT runs.id
                    FROM preview_backfill_runs AS runs
                    WHERE runs.state = 'completed'
                      AND runs.completed_at <= ?
                      AND NOT EXISTS (
                        SELECT 1
                        FROM preview_backfill_items AS items
                        JOIN outbox ON outbox.id = items.job_id
                        WHERE items.run_id = runs.id
                      )
                      AND NOT EXISTS (
                        SELECT 1
                        FROM preview_backfill_items AS items
                        JOIN jobs ON jobs.id = items.job_id
                        WHERE items.run_id = runs.id
                      )
                    ORDER BY runs.completed_at, runs.id
                    LIMIT ?
                )
            `,
            [input.completedBefore, input.limit],
        );
        return result.changes;
    });

    const reconcile = Effect.fn('PreviewBackfillRepository.reconcile')(
        function* (now: number) {
            const staleBefore = now - 24 * 60 * 60 * 1_000_000;
            const results = yield* d1Store.batch([
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET
                            state = 'pending',
                            last_error_code = NULL,
                            completed_at = NULL,
                            updated_at = ?
                        WHERE state = 'queued'
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_runs
                            WHERE id = preview_backfill_items.run_id
                              AND active_slot = 1
                          )
                          AND EXISTS (
                            SELECT 1
                            FROM bookmarks
                            WHERE short_url = preview_backfill_items.bookmark_short_url
                              AND deletion_state = 'active'
                              AND metadata_state = 'completed'
                              AND thumbnail_key IS NULL
                              AND thumbnail_sha256 IS NULL
                          )
                          AND NOT EXISTS (
                            SELECT 1 FROM outbox
                            WHERE id = preview_backfill_items.job_id
                          )
                          AND NOT EXISTS (
                            SELECT 1 FROM jobs
                            WHERE id = preview_backfill_items.job_id
                          )
                    `,
                    parameters: [now],
                },
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET
                            state = 'skipped',
                            last_error_code = 'bookmark_not_eligible',
                            completed_at = ?,
                            updated_at = ?
                        WHERE state IN ('pending', 'queued')
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_runs
                            WHERE id = preview_backfill_items.run_id
                              AND active_slot = 1
                          )
                          AND NOT EXISTS (
                            SELECT 1
                            FROM bookmarks
                            WHERE short_url = preview_backfill_items.bookmark_short_url
                              AND deletion_state = 'active'
                              AND metadata_state = 'completed'
                              AND thumbnail_key IS NULL
                              AND thumbnail_sha256 IS NULL
                          )
                    `,
                    parameters: [now, now],
                },
                {
                    sql: `
                        UPDATE outbox
                        SET
                            state = 'failed',
                            claim_token = NULL,
                            lease_expires_at = NULL,
                            last_error_code = 'preview_backfill_stalled',
                            completed_at = ?,
                            updated_at = ?
                        WHERE id IN (
                            SELECT items.job_id
                            FROM preview_backfill_items AS items
                            JOIN preview_backfill_runs AS runs
                                ON runs.id = items.run_id
                            WHERE runs.active_slot = 1
                              AND items.state = 'queued'
                              AND items.updated_at <= ?
                        )
                          AND state <> 'failed'
                    `,
                    parameters: [now, now, staleBefore],
                },
                {
                    sql: `
                        UPDATE jobs
                        SET
                            state = 'failed',
                            lease_token = NULL,
                            lease_expires_at = NULL,
                            last_error_code = 'preview_backfill_stalled',
                            completed_at = ?,
                            updated_at = ?
                        WHERE id IN (
                            SELECT items.job_id
                            FROM preview_backfill_items AS items
                            JOIN preview_backfill_runs AS runs
                                ON runs.id = items.run_id
                            WHERE runs.active_slot = 1
                              AND items.state = 'queued'
                              AND items.updated_at <= ?
                        )
                          AND state NOT IN ('completed', 'failed', 'needs_review')
                    `,
                    parameters: [now, now, staleBefore],
                },
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET
                            state = 'failed',
                            last_error_code = 'preview_backfill_stalled',
                            completed_at = ?,
                            updated_at = ?
                        WHERE state = 'queued'
                          AND updated_at <= ?
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_runs
                            WHERE id = preview_backfill_items.run_id
                              AND active_slot = 1
                          )
                    `,
                    parameters: [now, now, staleBefore],
                },
                {
                    sql: `
                        UPDATE preview_backfill_runs
                        SET
                            state = 'completed',
                            active_slot = NULL,
                            completed_at = ?,
                            updated_at = ?
                        WHERE state IN ('running', 'paused')
                          AND NOT EXISTS (
                            SELECT 1
                            FROM preview_backfill_items
                            WHERE run_id = preview_backfill_runs.id
                              AND state IN ('pending', 'queued')
                          )
                    `,
                    parameters: [now, now],
                },
            ]);
            return (
                (results[0]?.changes ?? 0) +
                (results[1]?.changes ?? 0) +
                (results[4]?.changes ?? 0) +
                (results[5]?.changes ?? 0)
            );
        },
    );

    const deferForMaintenance = Effect.fn(
        'PreviewBackfillRepository.deferForMaintenance',
    )(function* (jobId: string, now: number) {
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE preview_backfill_items
                    SET
                        state = 'pending',
                        last_error_code = 'maintenance_deferred',
                        updated_at = ?
                    WHERE job_id = ?
                      AND state = 'queued'
                      AND EXISTS (
                        SELECT 1
                        FROM preview_backfill_runs
                        WHERE id = preview_backfill_items.run_id
                          AND active_slot = 1
                      )
                `,
                parameters: [now, jobId],
            },
            {
                sql: `
                    DELETE FROM jobs
                    WHERE id = ?
                      AND EXISTS (
                        SELECT 1
                        FROM preview_backfill_items
                        WHERE job_id = ?
                          AND state = 'pending'
                          AND last_error_code = 'maintenance_deferred'
                          AND updated_at = ?
                      )
                `,
                parameters: [jobId, jobId, now],
            },
            {
                sql: `
                    DELETE FROM outbox
                    WHERE id = ?
                      AND EXISTS (
                        SELECT 1
                        FROM preview_backfill_items
                        WHERE job_id = ?
                          AND state = 'pending'
                          AND last_error_code = 'maintenance_deferred'
                          AND updated_at = ?
                      )
                `,
                parameters: [jobId, jobId, now],
            },
        ]);
        return (results[0]?.changes ?? 0) === 1;
    });

    const enqueueBatch = Effect.fn('PreviewBackfillRepository.enqueueBatch')(
        function* (input: {
            readonly batchLimit: number;
            readonly maxInFlight: number;
            readonly now: number;
        }) {
            const results = yield* d1Store.batch([
                {
                    sql: `
                        INSERT OR IGNORE INTO outbox (
                            id,
                            bookmark_short_url,
                            kind,
                            state,
                            payload_version,
                            payload_json,
                            available_at,
                            created_at,
                            updated_at
                        )
                        SELECT
                            items.job_id,
                            items.bookmark_short_url,
                            'metadata',
                            'pending',
                            1,
                            json_object(
                                'bookmarkShortUrl', items.bookmark_short_url,
                                'jobId', items.job_id,
                                'kind', 'metadata',
                                'operation', 'preview_backfill',
                                'runId', items.run_id,
                                'version', 1
                            ),
                            ?,
                            ?,
                            ?
                        FROM preview_backfill_items AS items
                        JOIN preview_backfill_runs AS runs
                            ON runs.id = items.run_id
                        JOIN bookmarks
                            ON bookmarks.short_url = items.bookmark_short_url
                        WHERE runs.state = 'running'
                          AND runs.active_slot = 1
                          AND (
                            runs.last_admitted_at IS NULL
                            OR runs.last_admitted_at <= ?
                          )
                          AND items.state = 'pending'
                          AND bookmarks.deletion_state = 'active'
                          AND bookmarks.metadata_state = 'completed'
                          AND bookmarks.thumbnail_key IS NULL
                          AND bookmarks.thumbnail_sha256 IS NULL
                          AND NOT EXISTS (
                            SELECT 1 FROM app_state WHERE read_only = 1
                          )
                        ORDER BY bookmarks.created_at DESC, bookmarks.id DESC
                        LIMIT MAX(
                            0,
                            MIN(
                                ?,
                                ? - (
                                    SELECT COUNT(*)
                                    FROM preview_backfill_items AS active_items
                                    JOIN preview_backfill_runs AS active_runs
                                        ON active_runs.id = active_items.run_id
                                    WHERE active_runs.active_slot = 1
                                      AND active_items.state = 'queued'
                                )
                            )
                        )
                    `,
                    parameters: [
                        input.now,
                        input.now,
                        input.now,
                        input.now - 60 * 1_000_000,
                        input.batchLimit,
                        input.maxInFlight,
                    ],
                },
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET state = 'queued', updated_at = ?
                        WHERE state = 'pending'
                          AND EXISTS (
                            SELECT 1
                            FROM outbox
                            WHERE outbox.id = preview_backfill_items.job_id
                          )
                    `,
                    parameters: [input.now],
                },
                {
                    sql: `
                        UPDATE preview_backfill_runs
                        SET last_admitted_at = ?, updated_at = ?
                        WHERE state = 'running'
                          AND active_slot = 1
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_items AS items
                            JOIN outbox ON outbox.id = items.job_id
                            WHERE items.run_id = preview_backfill_runs.id
                              AND items.state = 'queued'
                              AND items.updated_at = ?
                              AND outbox.created_at = ?
                          )
                    `,
                    parameters: [input.now, input.now, input.now, input.now],
                },
            ]);
            return results[0]?.changes ?? 0;
        },
    );

    const findTarget = Effect.fn('PreviewBackfillRepository.findTarget')(
        (jobId: string, bookmarkShortUrl: string) =>
            d1Store.first(
                PreviewBackfillTarget,
                `
                    SELECT
                        items.run_id AS "runId",
                        items.job_id AS "jobId",
                        items.bookmark_short_url AS "bookmarkShortUrl",
                        bookmarks.url,
                        bookmarks.thumbnail_url AS "thumbnailUrl",
                        bookmarks.updated_at AS "updatedAt"
                    FROM preview_backfill_items AS items
                    JOIN bookmarks
                        ON bookmarks.short_url = items.bookmark_short_url
                    WHERE items.job_id = ?
                      AND items.bookmark_short_url = ?
                      AND items.state = 'queued'
                      AND bookmarks.deletion_state = 'active'
                      AND bookmarks.metadata_state = 'completed'
                      AND bookmarks.thumbnail_key IS NULL
                      AND bookmarks.thumbnail_sha256 IS NULL
                `,
                [jobId, bookmarkShortUrl],
            ),
    );

    const finishItem = Effect.fn('PreviewBackfillRepository.finishItem')(
        function* (input: {
            readonly errorCode: string | null;
            readonly jobId: string;
            readonly now: number;
            readonly sourceUrl: string | null;
            readonly state: PreviewBackfillTerminalState;
            readonly token: string;
        }) {
            const results = yield* d1Store.batch([
                {
                    sql: `
                        UPDATE bookmarks
                        SET thumbnail_url = COALESCE(thumbnail_url, ?)
                        WHERE short_url = (
                            SELECT bookmark_short_url
                            FROM preview_backfill_items
                            WHERE job_id = ?
                        )
                          AND deletion_state = 'active'
                          AND metadata_state = 'completed'
                          AND thumbnail_key IS NULL
                          AND thumbnail_sha256 IS NULL
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_items AS items
                            JOIN jobs ON jobs.id = items.job_id
                            WHERE items.job_id = ?
                              AND items.state = 'queued'
                              AND jobs.state = 'processing'
                              AND jobs.lease_token = ?
                              AND jobs.lease_expires_at > ?
                          )
                    `,
                    parameters: [
                        input.sourceUrl,
                        input.jobId,
                        input.jobId,
                        input.token,
                        input.now,
                    ],
                },
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET
                            state = ?,
                            last_error_code = ?,
                            completed_at = ?,
                            updated_at = ?
                        WHERE job_id = ?
                          AND state = 'queued'
                          AND EXISTS (
                            SELECT 1
                            FROM jobs
                            WHERE jobs.id = preview_backfill_items.job_id
                              AND jobs.state = 'processing'
                              AND jobs.lease_token = ?
                              AND jobs.lease_expires_at > ?
                          )
                    `,
                    parameters: [
                        input.state,
                        input.errorCode,
                        input.now,
                        input.now,
                        input.jobId,
                        input.token,
                        input.now,
                    ],
                },
                {
                    sql: completeRunStatement,
                    parameters: [input.now, input.now, input.jobId],
                },
            ]);
            return (results[1]?.changes ?? 0) === 1;
        },
    );

    const terminalizeItem = Effect.fn(
        'PreviewBackfillRepository.terminalizeItem',
    )(function* (input: {
        readonly errorCode: string;
        readonly jobId: string;
        readonly now: number;
        readonly state: 'failed' | 'skipped';
    }) {
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE preview_backfill_items
                    SET
                        state = ?,
                        last_error_code = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE job_id = ? AND state = 'queued'
                `,
                parameters: [
                    input.state,
                    input.errorCode,
                    input.now,
                    input.now,
                    input.jobId,
                ],
            },
            {
                sql: completeRunStatement,
                parameters: [input.now, input.now, input.jobId],
            },
        ]);
        return (results[0]?.changes ?? 0) === 1;
    });

    const attachPreview = Effect.fn('PreviewBackfillRepository.attachPreview')(
        function* (input: {
            readonly contentType: string;
            readonly expectedUpdatedAt: number;
            readonly height: number;
            readonly jobId: string;
            readonly key: string;
            readonly now: number;
            readonly sha256: string;
            readonly size: number;
            readonly sourceUrl: string;
            readonly token: string;
            readonly width: number;
        }) {
            const results = yield* d1Store.batch([
                {
                    sql: `
                        UPDATE bookmarks
                        SET
                            thumbnail_url = ?,
                            thumbnail_key = ?,
                            thumbnail_content_type = ?,
                            thumbnail_size = ?,
                            thumbnail_width = ?,
                            thumbnail_height = ?,
                            thumbnail_sha256 = ?
                        WHERE short_url = (
                            SELECT bookmark_short_url
                            FROM preview_backfill_items
                            WHERE job_id = ?
                        )
                          AND deletion_state = 'active'
                          AND metadata_state = 'completed'
                          AND thumbnail_key IS NULL
                          AND thumbnail_sha256 IS NULL
                          AND updated_at = ?
                          AND EXISTS (
                            SELECT 1
                            FROM preview_backfill_items AS items
                            JOIN jobs ON jobs.id = items.job_id
                            WHERE items.job_id = ?
                              AND items.state = 'queued'
                              AND jobs.state = 'processing'
                              AND jobs.lease_token = ?
                              AND jobs.lease_expires_at > ?
                          )
                    `,
                    parameters: [
                        input.sourceUrl,
                        input.key,
                        input.contentType,
                        input.size,
                        input.width,
                        input.height,
                        input.sha256,
                        input.jobId,
                        input.expectedUpdatedAt,
                        input.jobId,
                        input.token,
                        input.now,
                    ],
                },
                {
                    sql: `
                        UPDATE preview_backfill_items
                        SET
                            state = CASE
                                WHEN EXISTS (
                                    SELECT 1
                                    FROM bookmarks
                                    WHERE short_url = preview_backfill_items.bookmark_short_url
                                      AND thumbnail_key = ?
                                      AND thumbnail_sha256 = ?
                                ) THEN 'previewed'
                                ELSE 'skipped'
                            END,
                            last_error_code = CASE
                                WHEN EXISTS (
                                    SELECT 1
                                    FROM bookmarks
                                    WHERE short_url = preview_backfill_items.bookmark_short_url
                                      AND thumbnail_key = ?
                                      AND thumbnail_sha256 = ?
                                ) THEN NULL
                                ELSE 'bookmark_changed'
                            END,
                            completed_at = ?,
                            updated_at = ?
                        WHERE job_id = ?
                          AND state = 'queued'
                          AND EXISTS (
                            SELECT 1
                            FROM jobs
                            WHERE jobs.id = preview_backfill_items.job_id
                              AND jobs.state = 'processing'
                              AND jobs.lease_token = ?
                              AND jobs.lease_expires_at > ?
                          )
                    `,
                    parameters: [
                        input.key,
                        input.sha256,
                        input.key,
                        input.sha256,
                        input.now,
                        input.now,
                        input.jobId,
                        input.token,
                        input.now,
                    ],
                },
                {
                    sql: completeRunStatement,
                    parameters: [input.now, input.now, input.jobId],
                },
            ]);
            if ((results[1]?.changes ?? 0) !== 1) {
                return 'stale';
            }
            const item = yield* d1Store.first(
                PreviewBackfillItemState,
                `
                    SELECT state
                    FROM preview_backfill_items
                    WHERE job_id = ?
                      AND state IN ('previewed', 'skipped')
                `,
                [input.jobId],
            );
            return item?.state ?? 'stale';
        },
    );

    return {
        attachPreview,
        deferForMaintenance,
        enqueueBatch,
        findTarget,
        finishItem,
        getSummary,
        isBackfillJob: (jobId) => jobId.startsWith('preview-backfill:'),
        pause,
        pruneTerminalHistory,
        reconcile,
        resume,
        start,
        terminalizeItem,
    };
}
