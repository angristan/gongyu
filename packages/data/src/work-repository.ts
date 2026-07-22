import { QueueJobMessage } from '@gongyu/domain/jobs';
import { Context, Effect, Schema } from 'effect';
import type { D1Store, D1StoreFailure } from './d1-store';

export class OutboxDispatchLease extends Schema.Class<OutboxDispatchLease>(
    'OutboxDispatchLease',
)({
    attempts: Schema.Number,
    bookmarkShortUrl: Schema.String,
    id: Schema.String,
    kind: Schema.Union([
        Schema.Literal('metadata'),
        Schema.Literal('social'),
        Schema.Literal('thumbnail_delete'),
    ]),
    payloadJson: Schema.NullOr(Schema.String),
    token: Schema.String,
}) {}

export class JobLease extends Schema.Class<JobLease>('JobLease')({
    attempts: Schema.Number,
    bookmarkShortUrl: Schema.String,
    id: Schema.String,
    kind: Schema.String,
    leaseToken: Schema.String,
}) {}

export class JobStatus extends Schema.Class<JobStatus>('JobStatus')({
    availableAt: Schema.Number,
    leaseExpiresAt: Schema.NullOr(Schema.Number),
    state: Schema.String,
}) {}

class OutboxCount extends Schema.Class<OutboxCount>('OutboxCount')({
    count: Schema.Number,
}) {}

class PrunedOutbox extends Schema.Class<PrunedOutbox>('PrunedOutbox')({
    id: Schema.String,
}) {}

export class JobSummary extends Schema.Class<JobSummary>('JobSummary')({
    attempts: Schema.Number,
    bookmarkShortUrl: Schema.String,
    id: Schema.String,
    kind: Schema.String,
    lastErrorCode: Schema.NullOr(Schema.String),
    recoverable: Schema.Number,
    state: Schema.String,
    updatedAt: Schema.Number,
}) {}

export interface WorkRepositoryShape {
    readonly claimJob: (input: {
        readonly id: string;
        readonly leaseDurationMicros: number;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<JobLease | null, D1StoreFailure>;
    readonly claimOutbox: (input: {
        readonly leaseDurationMicros: number;
        readonly limit: number;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<ReadonlyArray<OutboxDispatchLease>, D1StoreFailure>;
    readonly claimOutboxForBookmark: (input: {
        readonly bookmarkShortUrl: string;
        readonly kind: OutboxDispatchLease['kind'];
        readonly leaseDurationMicros: number;
        readonly limit: number;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<ReadonlyArray<OutboxDispatchLease>, D1StoreFailure>;
    readonly completeJob: (input: {
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly completeOutbox: (input: {
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly countOutstandingOutbox: (input: {
        readonly bookmarkShortUrl: string;
        readonly kind: OutboxDispatchLease['kind'];
    }) => Effect.Effect<number, D1StoreFailure>;
    readonly ensureJob: (
        message: QueueJobMessage,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
    readonly failJob: (input: {
        readonly errorCode: string;
        readonly id: string;
        readonly needsReview: boolean;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly getJobStatus: (
        id: string,
    ) => Effect.Effect<JobStatus | null, D1StoreFailure>;
    readonly listJobs: (
        limit: number,
    ) => Effect.Effect<ReadonlyArray<JobSummary>, D1StoreFailure>;
    readonly pruneTerminalHistory: (input: {
        readonly before: number;
        readonly limit: number;
    }) => Effect.Effect<number, D1StoreFailure>;
    readonly reconcilePendingDeletions: (
        now: number,
    ) => Effect.Effect<number, D1StoreFailure>;
    readonly releaseJob: (input: {
        readonly availableAt: number;
        readonly errorCode: string;
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly resolveReviewedTwitter: (
        id: string,
        now: number,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly releaseOutbox: (input: {
        readonly availableAt: number;
        readonly errorCode: string;
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly retryJob: (
        id: string,
        now: number,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly terminalizeDeadLetter: (
        id: string,
        now: number,
    ) => Effect.Effect<void, D1StoreFailure>;
}

export class WorkRepository extends Context.Service<
    WorkRepository,
    WorkRepositoryShape
>()('@gongyu/data/WorkRepository') {}

export function makeWorkRepository(
    d1Store: D1Store['Service'],
): WorkRepositoryShape {
    const claimOutbox = Effect.fn('WorkRepository.claimOutbox')(
        function* (input: {
            readonly leaseDurationMicros: number;
            readonly limit: number;
            readonly now: number;
            readonly token: string;
        }) {
            const result = yield* d1Store.query(
                OutboxDispatchLease,
                `
                    UPDATE outbox
                    SET
                        state = 'claimed',
                        claim_token = ?,
                        lease_expires_at = ?,
                        attempts = attempts + 1,
                        updated_at = ?
                    WHERE id IN (
                        SELECT id
                        FROM outbox
                        WHERE available_at <= ?
                          AND NOT EXISTS (
                            SELECT 1 FROM app_state WHERE read_only = 1
                          )
                          AND (
                            state = 'pending'
                            OR (
                                state = 'claimed'
                                AND lease_expires_at <= ?
                            )
                          )
                        ORDER BY created_at
                        LIMIT ?
                    )
                    RETURNING
                        id,
                        bookmark_short_url AS "bookmarkShortUrl",
                        kind,
                        attempts,
                        payload_json AS "payloadJson",
                        claim_token AS token
                `,
                [
                    input.token,
                    input.now + input.leaseDurationMicros,
                    input.now,
                    input.now,
                    input.now,
                    input.limit,
                ],
            );
            return result.rows;
        },
    );

    const claimOutboxForBookmark = Effect.fn(
        'WorkRepository.claimOutboxForBookmark',
    )(function* (input: {
        readonly bookmarkShortUrl: string;
        readonly kind: OutboxDispatchLease['kind'];
        readonly leaseDurationMicros: number;
        readonly limit: number;
        readonly now: number;
        readonly token: string;
    }) {
        const result = yield* d1Store.query(
            OutboxDispatchLease,
            `
                UPDATE outbox
                SET
                    state = 'claimed',
                    claim_token = ?,
                    lease_expires_at = ?,
                    attempts = attempts + 1,
                    updated_at = ?
                WHERE id IN (
                    SELECT id
                    FROM outbox
                    WHERE bookmark_short_url = ?
                      AND kind = ?
                      AND available_at <= ?
                      AND NOT EXISTS (
                        SELECT 1 FROM app_state WHERE read_only = 1
                      )
                      AND (
                        state = 'pending'
                        OR (
                            state = 'claimed'
                            AND lease_expires_at <= ?
                        )
                      )
                    ORDER BY created_at, id
                    LIMIT ?
                )
                RETURNING
                    id,
                    bookmark_short_url AS "bookmarkShortUrl",
                    kind,
                    attempts,
                    payload_json AS "payloadJson",
                    claim_token AS token
            `,
            [
                input.token,
                input.now + input.leaseDurationMicros,
                input.now,
                input.bookmarkShortUrl,
                input.kind,
                input.now,
                input.now,
                input.limit,
            ],
        );
        return result.rows;
    });

    const countOutstandingOutbox = Effect.fn(
        'WorkRepository.countOutstandingOutbox',
    )(function* (input: {
        readonly bookmarkShortUrl: string;
        readonly kind: OutboxDispatchLease['kind'];
    }) {
        const row = yield* d1Store.first(
            OutboxCount,
            `
                SELECT COUNT(*) AS count
                FROM outbox
                WHERE bookmark_short_url = ?
                  AND kind = ?
                  AND state IN ('pending', 'claimed')
            `,
            [input.bookmarkShortUrl, input.kind],
        );
        return row?.count ?? 0;
    });

    const completeOutbox = Effect.fn('WorkRepository.completeOutbox')(
        function* (input: {
            readonly id: string;
            readonly now: number;
            readonly token: string;
        }) {
            const result = yield* d1Store.run(
                `
                    UPDATE outbox
                    SET
                        state = 'completed',
                        claim_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'claimed' AND claim_token = ?
                `,
                [input.now, input.now, input.id, input.token],
            );
            return result.changes === 1;
        },
    );

    const releaseOutbox = Effect.fn('WorkRepository.releaseOutbox')(
        function* (input: {
            readonly availableAt: number;
            readonly errorCode: string;
            readonly id: string;
            readonly now: number;
            readonly token: string;
        }) {
            const result = yield* d1Store.run(
                `
                    UPDATE outbox
                    SET
                        state = 'pending',
                        claim_token = NULL,
                        lease_expires_at = NULL,
                        available_at = ?,
                        last_error_code = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'claimed' AND claim_token = ?
                `,
                [
                    input.availableAt,
                    input.errorCode,
                    input.now,
                    input.id,
                    input.token,
                ],
            );
            return result.changes === 1;
        },
    );

    const ensureJob = Effect.fn('WorkRepository.ensureJob')(function* (
        message: QueueJobMessage,
        now: number,
    ) {
        yield* d1Store.run(
            `
                INSERT OR IGNORE INTO jobs (
                    id,
                    outbox_id,
                    bookmark_short_url,
                    kind,
                    state,
                    payload_version,
                    payload_json,
                    available_at,
                    created_at,
                    updated_at
                )
                SELECT ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?
                WHERE EXISTS (
                    SELECT 1 FROM outbox
                    WHERE id = ? AND bookmark_short_url = ?
                )
                  AND EXISTS (
                    SELECT 1 FROM bookmarks
                    WHERE short_url = ?
                )
            `,
            [
                message.jobId,
                message.jobId,
                message.bookmarkShortUrl,
                message.kind,
                message.version,
                JSON.stringify(message),
                now,
                now,
                now,
                message.jobId,
                message.bookmarkShortUrl,
                message.bookmarkShortUrl,
            ],
        );
    });

    const claimJob = Effect.fn('WorkRepository.claimJob')(
        (input: {
            readonly id: string;
            readonly leaseDurationMicros: number;
            readonly now: number;
            readonly token: string;
        }) =>
            d1Store.first(
                JobLease,
                `
                    UPDATE jobs
                    SET
                        state = 'processing',
                        lease_token = ?,
                        lease_expires_at = ?,
                        attempts = attempts + 1,
                        updated_at = ?
                    WHERE id = ?
                      AND available_at <= ?
                      AND NOT EXISTS (
                        SELECT 1 FROM app_state WHERE read_only = 1
                      )
                      AND (
                        state IN ('queued', 'retrying')
                        OR (
                            state = 'processing'
                            AND lease_expires_at <= ?
                        )
                      )
                    RETURNING
                        id,
                        bookmark_short_url AS "bookmarkShortUrl",
                        kind,
                        lease_token AS "leaseToken",
                        attempts
                `,
                [
                    input.token,
                    input.now + input.leaseDurationMicros,
                    input.now,
                    input.id,
                    input.now,
                    input.now,
                ],
            ),
    );

    const completeJob = Effect.fn('WorkRepository.completeJob')(
        function* (input: {
            readonly id: string;
            readonly now: number;
            readonly token: string;
        }) {
            const result = yield* d1Store.run(
                `
                    UPDATE jobs
                    SET
                        state = 'completed',
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                [input.now, input.now, input.id, input.token],
            );
            return result.changes === 1;
        },
    );

    const releaseJob = Effect.fn('WorkRepository.releaseJob')(
        function* (input: {
            readonly availableAt: number;
            readonly errorCode: string;
            readonly id: string;
            readonly now: number;
            readonly token: string;
        }) {
            const result = yield* d1Store.run(
                `
                    UPDATE jobs
                    SET
                        state = 'retrying',
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        available_at = ?,
                        last_error_code = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                [
                    input.availableAt,
                    input.errorCode,
                    input.now,
                    input.id,
                    input.token,
                ],
            );
            return result.changes === 1;
        },
    );

    const failJob = Effect.fn('WorkRepository.failJob')(function* (input: {
        readonly errorCode: string;
        readonly id: string;
        readonly needsReview: boolean;
        readonly now: number;
        readonly token: string;
    }) {
        const result = yield* d1Store.run(
            `
                UPDATE jobs
                SET
                    state = ?,
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    last_error_code = ?,
                    completed_at = ?,
                    updated_at = ?
                WHERE id = ? AND state = 'processing' AND lease_token = ?
            `,
            [
                input.needsReview ? 'needs_review' : 'failed',
                input.errorCode,
                input.now,
                input.now,
                input.id,
                input.token,
            ],
        );
        return result.changes === 1;
    });

    const getJobStatus = Effect.fn('WorkRepository.getJobStatus')(
        (id: string) =>
            d1Store.first(
                JobStatus,
                `
                    SELECT
                        state,
                        available_at AS "availableAt",
                        lease_expires_at AS "leaseExpiresAt"
                    FROM jobs
                    WHERE id = ?
                `,
                [id],
            ),
    );

    const listJobs = Effect.fn('WorkRepository.listJobs')(function* (
        limit: number,
    ) {
        const result = yield* d1Store.query(
            JobSummary,
            `
                SELECT *
                FROM (
                    SELECT
                        id,
                        bookmark_short_url AS "bookmarkShortUrl",
                        kind,
                        state,
                        attempts,
                        last_error_code AS "lastErrorCode",
                        1 AS recoverable,
                        updated_at AS "updatedAt"
                    FROM jobs
                    WHERE kind <> 'social'

                    UNION ALL

                    SELECT
                        id,
                        bookmark_short_url AS "bookmarkShortUrl",
                        'social:' || provider AS kind,
                        state,
                        attempts,
                        last_error_code AS "lastErrorCode",
                        CASE WHEN EXISTS (
                            SELECT 1 FROM jobs WHERE jobs.id = social_deliveries.id
                        ) THEN 1 ELSE 0 END AS recoverable,
                        updated_at AS "updatedAt"
                    FROM social_deliveries
                )
                ORDER BY "updatedAt" DESC
                LIMIT ?
            `,
            [limit],
        );
        return result.rows;
    });

    const terminalizeDeadLetter = Effect.fn(
        'WorkRepository.terminalizeDeadLetter',
    )(function* (id: string, now: number) {
        yield* d1Store.batch([
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = 'failed',
                        last_error_code = 'retry_exhausted',
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                      AND state NOT IN ('delivered', 'failed', 'needs_review')
                `,
                parameters: [now, now, id],
            },
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = 'failed',
                        last_error_code = 'retry_exhausted',
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                      AND state NOT IN ('completed', 'failed', 'needs_review')
                `,
                parameters: [now, now, id],
            },
        ]);
    });

    const pruneTerminalHistory = Effect.fn(
        'WorkRepository.pruneTerminalHistory',
    )(function* (input: { readonly before: number; readonly limit: number }) {
        const result = yield* d1Store.query(
            PrunedOutbox,
            `
                DELETE FROM outbox
                WHERE id IN (
                    SELECT outbox.id
                    FROM outbox
                    LEFT JOIN jobs ON jobs.outbox_id = outbox.id
                    WHERE outbox.kind IN (
                        'metadata',
                        'social',
                        'thumbnail_delete'
                    )
                      AND outbox.state IN ('completed', 'failed')
                      AND outbox.updated_at < ?
                      AND (
                        jobs.id IS NULL
                        OR (
                            jobs.state IN ('completed', 'failed')
                            AND jobs.updated_at < ?
                        )
                      )
                    ORDER BY outbox.updated_at, outbox.id
                    LIMIT ?
                )
                RETURNING id
            `,
            [input.before, input.before, input.limit],
        );
        return result.rows.length;
    });

    const reconcilePendingDeletions = Effect.fn(
        'WorkRepository.reconcilePendingDeletions',
    )(function* (now: number) {
        const result = yield* d1Store.run(
            `
                INSERT OR IGNORE INTO outbox (
                    id,
                    bookmark_short_url,
                    kind,
                    state,
                    payload_version,
                    available_at,
                    created_at,
                    updated_at
                )
                SELECT
                    'thumbnail-delete:' || short_url || ':1',
                    short_url,
                    'thumbnail_delete',
                    'pending',
                    1,
                    ?,
                    ?,
                    ?
                FROM bookmarks
                WHERE deletion_state = 'pending'
                  AND (
                    thumbnail_key IS NOT NULL
                    OR thumbnail_cleanup_key IS NOT NULL
                  )
            `,
            [now, now, now],
        );
        return result.changes;
    });

    const resolveReviewedTwitter = Effect.fn(
        'WorkRepository.resolveReviewedTwitter',
    )(function* (id: string, now: number) {
        const eligible = yield* d1Store.first(
            class EligibleRow extends Schema.Class<EligibleRow>('EligibleRow')({
                id: Schema.String,
            }) {},
            `
                SELECT j.id
                FROM jobs AS j
                JOIN social_deliveries AS d ON d.id = j.id
                WHERE j.id = ?
                  AND j.state = 'needs_review'
                  AND d.state = 'needs_review'
                  AND d.provider = 'twitter'
            `,
            [id],
        );
        if (eligible === null) {
            return false;
        }
        yield* d1Store.batch([
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = 'delivered',
                        remote_id = 'administrator-confirmed',
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'needs_review' AND provider = 'twitter'
                `,
                parameters: [now, now, id],
            },
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = 'completed',
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'needs_review'
                `,
                parameters: [now, now, id],
            },
        ]);
        return true;
    });

    const retryJob = Effect.fn('WorkRepository.retryJob')(function* (
        id: string,
        now: number,
    ) {
        const job = yield* d1Store.first(
            JobSummary,
            `
                SELECT
                    id,
                    bookmark_short_url AS "bookmarkShortUrl",
                    kind,
                    state,
                    attempts,
                    last_error_code AS "lastErrorCode",
                    1 AS recoverable,
                    updated_at AS "updatedAt"
                FROM jobs
                WHERE id = ? AND state IN ('failed', 'needs_review')
            `,
            [id],
        );
        if (job === null) {
            return false;
        }
        const message = QueueJobMessage.make({
            bookmarkShortUrl: job.bookmarkShortUrl,
            jobId: job.id,
            kind:
                job.kind === 'social'
                    ? 'social'
                    : job.kind === 'thumbnail_delete'
                      ? 'thumbnail_delete'
                      : 'metadata',
            version: 1,
        });
        yield* d1Store.batch([
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = 'retrying',
                        attempts = 0,
                        available_at = ?,
                        last_error_code = NULL,
                        completed_at = NULL,
                        updated_at = ?
                    WHERE id = ? AND state IN ('failed', 'needs_review')
                `,
                parameters: [now, now, id],
            },
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = 'retrying',
                        attempts = 0,
                        available_at = ?,
                        last_error_code = NULL,
                        completed_at = NULL,
                        updated_at = ?
                    WHERE id = ? AND state IN ('failed', 'needs_review')
                `,
                parameters: [now, now, id],
            },
            {
                sql: `
                    INSERT INTO outbox (
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
                    VALUES (?, ?, ?, 'pending', 1, ?, ?, ?, ?)
                `,
                parameters: [
                    `retry:${id}:${now}`,
                    job.bookmarkShortUrl,
                    message.kind,
                    JSON.stringify(message),
                    now,
                    now,
                    now,
                ],
            },
        ]);
        return true;
    });

    return {
        claimJob,
        claimOutbox,
        claimOutboxForBookmark,
        completeJob,
        completeOutbox,
        countOutstandingOutbox,
        ensureJob,
        failJob,
        getJobStatus,
        listJobs,
        pruneTerminalHistory,
        reconcilePendingDeletions,
        releaseJob,
        releaseOutbox,
        resolveReviewedTwitter,
        retryJob,
        terminalizeDeadLetter,
    };
}
