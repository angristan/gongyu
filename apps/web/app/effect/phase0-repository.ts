import { Effect, Schema } from 'effect';
import { D1Store } from './d1-store';

export class Phase0Bookmark extends Schema.Class<Phase0Bookmark>(
    'Phase0Bookmark',
)({
    createdAt: Schema.Number,
    id: Schema.Number,
    shortUrl: Schema.String,
    title: Schema.String,
}) {}

export class Phase0JobLease extends Schema.Class<Phase0JobLease>(
    'Phase0JobLease',
)({
    attempts: Schema.Number,
    bookmarkShortUrl: Schema.String,
    id: Schema.String,
    leaseExpiresAt: Schema.Number,
    leaseToken: Schema.String,
    payloadVersion: Schema.Number,
}) {}

export interface CreateBookmarkAndJobInput {
    readonly createdAt: number;
    readonly jobId: string;
    readonly shortUrl: string;
    readonly title: string;
}

export const createBookmarkAndJob = Effect.fn(
    'Phase0Repository.createBookmarkAndJob',
)(function* (input: CreateBookmarkAndJobInput) {
    const d1Store = yield* D1Store;
    yield* Effect.annotateCurrentSpan({
        jobId: input.jobId,
        shortUrl: input.shortUrl,
    });
    yield* d1Store.batch([
        {
            sql: `
                INSERT INTO phase0_bookmarks (short_url, title, created_at)
                VALUES (?, ?, ?)
            `,
            parameters: [input.shortUrl, input.title, input.createdAt],
        },
        {
            sql: `
                INSERT INTO phase0_jobs (
                    id,
                    bookmark_short_url,
                    state,
                    payload_version,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, 'pending', 1, ?, ?)
            `,
            parameters: [
                input.jobId,
                input.shortUrl,
                input.createdAt,
                input.createdAt,
            ],
        },
    ]);
});

export const findBookmarkByShortUrl = Effect.fn(
    'Phase0Repository.findBookmarkByShortUrl',
)(function* (shortUrl: string) {
    const d1Store = yield* D1Store;
    return yield* d1Store.first(
        Phase0Bookmark,
        `
            SELECT
                id,
                short_url AS "shortUrl",
                title,
                created_at AS "createdAt"
            FROM phase0_bookmarks
            WHERE short_url = ?
        `,
        [shortUrl],
    );
});

export const searchBookmarks = Effect.fn('Phase0Repository.searchBookmarks')(
    function* (query: string, limit = 20) {
        const d1Store = yield* D1Store;
        const result = yield* d1Store.query(
            Phase0Bookmark,
            `
                SELECT
                    b.id,
                    b.short_url AS "shortUrl",
                    b.title,
                    b.created_at AS "createdAt"
                FROM phase0_bookmarks_fts
                JOIN phase0_bookmarks AS b
                    ON b.id = phase0_bookmarks_fts.rowid
                WHERE phase0_bookmarks_fts MATCH ?
                ORDER BY bm25(phase0_bookmarks_fts), b.id DESC
                LIMIT ?
            `,
            [query, limit],
        );
        return result.rows;
    },
);

export const claimJob = Effect.fn('Phase0Repository.claimJob')(
    function* (input: {
        readonly jobId: string;
        readonly leaseDurationMs: number;
        readonly leaseToken: string;
        readonly now: number;
    }) {
        const d1Store = yield* D1Store;
        const leaseExpiresAt = input.now + input.leaseDurationMs;
        yield* Effect.annotateCurrentSpan({
            jobId: input.jobId,
            leaseToken: input.leaseToken,
        });

        return yield* d1Store.first(
            Phase0JobLease,
            `
                UPDATE phase0_jobs
                SET
                    state = 'processing',
                    lease_token = ?,
                    lease_expires_at = ?,
                    attempts = attempts + 1,
                    updated_at = ?
                WHERE id = ?
                  AND (
                    state = 'pending'
                    OR (
                        state = 'processing'
                        AND lease_expires_at <= ?
                    )
                  )
                RETURNING
                    id,
                    bookmark_short_url AS "bookmarkShortUrl",
                    lease_token AS "leaseToken",
                    lease_expires_at AS "leaseExpiresAt",
                    attempts,
                    payload_version AS "payloadVersion"
            `,
            [
                input.leaseToken,
                leaseExpiresAt,
                input.now,
                input.jobId,
                input.now,
            ],
        );
    },
);

export const completeJob = Effect.fn('Phase0Repository.completeJob')(
    function* (input: {
        readonly completedAt: number;
        readonly jobId: string;
        readonly leaseToken: string;
    }) {
        const d1Store = yield* D1Store;
        const meta = yield* d1Store.run(
            `
                UPDATE phase0_jobs
                SET
                    state = 'completed',
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    updated_at = ?
                WHERE id = ?
                  AND state = 'processing'
                  AND lease_token = ?
            `,
            [input.completedAt, input.jobId, input.leaseToken],
        );
        return meta.changes === 1;
    },
);
