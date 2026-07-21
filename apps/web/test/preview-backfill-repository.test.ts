import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    makePreviewBackfillRepository,
    PreviewBackfillRepository,
} from '@gongyu/data/preview-backfill-repository';
import {
    makeWorkRepository,
    WorkRepository,
} from '@gongyu/data/work-repository';
import {
    BackgroundQueueMessage,
    PreviewBackfillQueueMessage,
} from '@gongyu/domain/jobs';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.succeed(
    D1Store,
    makeD1Store(env.DB.withSession('first-primary')),
);
const TestLayer = Layer.mergeAll(
    D1StoreTest,
    Layer.provide(
        Layer.effect(
            BookmarkRepository,
            Effect.gen(function* () {
                return makeBookmarkRepository(yield* D1Store);
            }),
        ),
        D1StoreTest,
    ),
    Layer.provide(
        Layer.effect(
            PreviewBackfillRepository,
            Effect.gen(function* () {
                return makePreviewBackfillRepository(yield* D1Store);
            }),
        ),
        D1StoreTest,
    ),
    Layer.provide(
        Layer.effect(
            WorkRepository,
            Effect.gen(function* () {
                return makeWorkRepository(yield* D1Store);
            }),
        ),
        D1StoreTest,
    ),
);

class BackfillOutboxRow extends Schema.Class<BackfillOutboxRow>(
    'BackfillOutboxRow',
)({
    bookmarkShortUrl: Schema.String,
    jobId: Schema.String,
    payloadJson: Schema.String,
}) {}

class ThumbnailRow extends Schema.Class<ThumbnailRow>('ThumbnailRow')({
    key: Schema.NullOr(Schema.String),
}) {}

it.layer(TestLayer)('preview backfill repository', (it) => {
    it.effect(
        'snapshots newest candidates and bounds admission through pause and resume',
        () =>
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                const backfill = yield* PreviewBackfillRepository;
                const d1 = yield* D1Store;
                const work = yield* WorkRepository;
                const oldest = yield* bookmarks.create({
                    createdAt: 1_000,
                    description: null,
                    title: 'Oldest candidate',
                    url: 'https://example.com/oldest-preview',
                });
                const middle = yield* bookmarks.create({
                    createdAt: 2_000,
                    description: null,
                    title: 'Middle candidate',
                    url: 'https://example.com/middle-preview',
                });
                const newest = yield* bookmarks.create({
                    createdAt: 3_000,
                    description: null,
                    title: 'Newest candidate',
                    url: 'https://example.com/newest-preview',
                });
                yield* d1.run(
                    `UPDATE bookmarks SET metadata_state = 'completed'`,
                );

                assert.isTrue(
                    yield* backfill.start({
                        itemLimit: 2,
                        now: 4_000,
                        runId: 'preview-run-1',
                    }),
                );
                assert.isFalse(
                    yield* backfill.start({
                        itemLimit: 1,
                        now: 4_001,
                        runId: 'preview-run-concurrent',
                    }),
                );
                let summary = yield* backfill.getSummary;
                assert.strictEqual(summary.total, 2);
                assert.strictEqual(summary.pending, 2);
                assert.strictEqual(summary.state, 'running');
                assert.isTrue(yield* backfill.pause('preview-run-1', 4_100));
                assert.strictEqual(
                    yield* backfill.enqueueBatch({
                        batchLimit: 1,
                        maxInFlight: 2,
                        now: 4_200,
                    }),
                    0,
                );
                assert.isTrue(yield* backfill.resume('preview-run-1', 4_300));
                assert.strictEqual(
                    yield* backfill.enqueueBatch({
                        batchLimit: 1,
                        maxInFlight: 2,
                        now: 4_400,
                    }),
                    1,
                );
                assert.strictEqual(
                    yield* backfill.enqueueBatch({
                        batchLimit: 5,
                        maxInFlight: 3,
                        now: 4_500,
                    }),
                    0,
                );
                assert.strictEqual(
                    yield* backfill.enqueueBatch({
                        batchLimit: 5,
                        maxInFlight: 3,
                        now: 60_004_400,
                    }),
                    1,
                );

                const outbox = yield* d1.query(
                    BackfillOutboxRow,
                    `
                        SELECT
                            id AS "jobId",
                            bookmark_short_url AS "bookmarkShortUrl",
                            payload_json AS "payloadJson"
                        FROM outbox
                        WHERE id LIKE 'preview-backfill:%'
                        ORDER BY created_at, id
                    `,
                );
                assert.lengthOf(outbox.rows, 2);
                assert.deepEqual(
                    new Set(outbox.rows.map((row) => row.bookmarkShortUrl)),
                    new Set([middle.shortUrl, newest.shortUrl]),
                );
                const payload = yield* Schema.decodeUnknownEffect(
                    BackgroundQueueMessage,
                )(JSON.parse(outbox.rows[0].payloadJson));
                assert.instanceOf(payload, PreviewBackfillQueueMessage);
                if (payload instanceof PreviewBackfillQueueMessage) {
                    assert.strictEqual(payload.operation, 'preview_backfill');
                    assert.strictEqual(payload.runId, 'preview-run-1');
                }

                const newestRow = outbox.rows.find(
                    (row) => row.bookmarkShortUrl === newest.shortUrl,
                );
                const middleRow = outbox.rows.find(
                    (row) => row.bookmarkShortUrl === middle.shortUrl,
                );
                assert.isDefined(newestRow);
                assert.isDefined(middleRow);
                const newestMessage = yield* Schema.decodeUnknownEffect(
                    BackgroundQueueMessage,
                )(JSON.parse(newestRow.payloadJson));
                const middleMessage = yield* Schema.decodeUnknownEffect(
                    BackgroundQueueMessage,
                )(JSON.parse(middleRow.payloadJson));
                yield* work.ensureJob(newestMessage, 60_004_600);
                yield* work.ensureJob(middleMessage, 60_004_600);
                assert.isNotNull(
                    yield* work.claimJob({
                        id: newestRow.jobId,
                        leaseDurationMicros: 1_000_000,
                        now: 60_004_600,
                        token: 'newest-token',
                    }),
                );
                assert.isNotNull(
                    yield* work.claimJob({
                        id: middleRow.jobId,
                        leaseDurationMicros: 1_000_000,
                        now: 60_004_600,
                        token: 'middle-token',
                    }),
                );
                yield* backfill.finishItem({
                    errorCode: null,
                    jobId: newestRow.jobId,
                    now: 60_004_700,
                    sourceUrl: null,
                    state: 'no_preview',
                    token: 'newest-token',
                });
                const target = yield* backfill.findTarget(
                    middleRow.jobId,
                    middle.shortUrl,
                );
                assert.isNotNull(target);
                assert.strictEqual(
                    yield* backfill.attachPreview({
                        contentType: 'image/webp',
                        expectedUpdatedAt: target.updatedAt,
                        height: 80,
                        jobId: middleRow.jobId,
                        key: `thumbnails/${middle.shortUrl}/digest.webp`,
                        now: 60_004_800,
                        sha256: 'a'.repeat(64),
                        size: 512,
                        sourceUrl: 'https://example.com/preview.webp',
                        token: 'middle-token',
                        width: 120,
                    }),
                    'previewed',
                );

                summary = yield* backfill.getSummary;
                assert.strictEqual(summary.noPreview, 1);
                assert.strictEqual(summary.previewed, 1);
                assert.strictEqual(summary.state, 'completed');
                assert.strictEqual(summary.pending, 0);
                assert.strictEqual(summary.queued, 0);
                const mirrored = yield* d1.first(
                    ThumbnailRow,
                    `SELECT thumbnail_key AS key FROM bookmarks WHERE short_url = ?`,
                    [middle.shortUrl],
                );
                assert.strictEqual(
                    mirrored?.key,
                    `thumbnails/${middle.shortUrl}/digest.webp`,
                );
                const excluded = yield* d1.first(
                    ThumbnailRow,
                    `SELECT thumbnail_key AS key FROM bookmarks WHERE short_url = ?`,
                    [oldest.shortUrl],
                );
                assert.isNull(excluded?.key);
            }),
    );

    it.effect('never overwrites a preview attached after admission', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const backfill = yield* PreviewBackfillRepository;
            const d1 = yield* D1Store;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 10_000,
                description: null,
                title: 'Concurrent preview',
                url: 'https://example.com/concurrent-preview',
            });
            yield* d1.run(
                `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.isTrue(
                yield* backfill.start({
                    itemLimit: 1,
                    now: 11_000,
                    runId: 'preview-run-2',
                }),
            );
            assert.strictEqual(
                yield* backfill.enqueueBatch({
                    batchLimit: 5,
                    maxInFlight: 10,
                    now: 12_000,
                }),
                1,
            );
            const jobId = `preview-backfill:preview-run-2:${bookmark.shortUrl}`;
            const target = yield* backfill.findTarget(jobId, bookmark.shortUrl);
            assert.isNotNull(target);
            yield* work.ensureJob(
                PreviewBackfillQueueMessage.make({
                    bookmarkShortUrl: bookmark.shortUrl,
                    jobId,
                    kind: 'metadata',
                    operation: 'preview_backfill',
                    runId: 'preview-run-2',
                    version: 1,
                }),
                12_100,
            );
            assert.isNotNull(
                yield* work.claimJob({
                    id: jobId,
                    leaseDurationMicros: 10_000,
                    now: 12_100,
                    token: 'concurrent-token',
                }),
            );
            yield* d1.run(
                `
                    UPDATE bookmarks
                    SET thumbnail_key = ?, thumbnail_sha256 = ?
                    WHERE short_url = ?
                `,
                [
                    `thumbnails/${bookmark.shortUrl}/existing.webp`,
                    'b'.repeat(64),
                    bookmark.shortUrl,
                ],
            );
            assert.strictEqual(
                yield* backfill.attachPreview({
                    contentType: 'image/webp',
                    expectedUpdatedAt: target.updatedAt,
                    height: 80,
                    jobId: target.jobId,
                    key: `thumbnails/${bookmark.shortUrl}/new.webp`,
                    now: 13_000,
                    sha256: 'c'.repeat(64),
                    size: 512,
                    sourceUrl: 'https://example.com/new.webp',
                    token: 'concurrent-token',
                    width: 120,
                }),
                'skipped',
            );
            const row = yield* d1.first(
                ThumbnailRow,
                `SELECT thumbnail_key AS key FROM bookmarks WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.strictEqual(
                row?.key,
                `thumbnails/${bookmark.shortUrl}/existing.webp`,
            );
            const summary = yield* backfill.getSummary;
            assert.strictEqual(summary.skipped, 1);
            assert.strictEqual(summary.state, 'completed');
        }),
    );

    it.effect('rejects attachment from an expired job lease', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const backfill = yield* PreviewBackfillRepository;
            const d1 = yield* D1Store;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 20_000,
                description: null,
                title: 'Stale lease preview',
                url: 'https://example.com/stale-preview-lease',
            });
            yield* d1.run(
                `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.isTrue(
                yield* backfill.start({
                    itemLimit: 1,
                    now: 21_000,
                    runId: 'preview-run-stale',
                }),
            );
            assert.strictEqual(
                yield* backfill.enqueueBatch({
                    batchLimit: 5,
                    maxInFlight: 10,
                    now: 22_000,
                }),
                1,
            );
            const jobId = `preview-backfill:preview-run-stale:${bookmark.shortUrl}`;
            const message = PreviewBackfillQueueMessage.make({
                bookmarkShortUrl: bookmark.shortUrl,
                jobId,
                kind: 'metadata',
                operation: 'preview_backfill',
                runId: 'preview-run-stale',
                version: 1,
            });
            yield* work.ensureJob(message, 22_000);
            assert.isNotNull(
                yield* work.claimJob({
                    id: jobId,
                    leaseDurationMicros: 100,
                    now: 22_000,
                    token: 'expired-token',
                }),
            );
            const target = yield* backfill.findTarget(jobId, bookmark.shortUrl);
            assert.isNotNull(target);
            assert.isNotNull(
                yield* work.claimJob({
                    id: jobId,
                    leaseDurationMicros: 1_000,
                    now: 22_101,
                    token: 'current-token',
                }),
            );
            assert.strictEqual(
                yield* backfill.attachPreview({
                    contentType: 'image/webp',
                    expectedUpdatedAt: target.updatedAt,
                    height: 80,
                    jobId,
                    key: `thumbnails/${bookmark.shortUrl}/stale.webp`,
                    now: 22_102,
                    sha256: 'e'.repeat(64),
                    size: 512,
                    sourceUrl: 'https://example.com/stale.webp',
                    token: 'expired-token',
                    width: 120,
                }),
                'stale',
            );
            const row = yield* d1.first(
                ThumbnailRow,
                `SELECT thumbnail_key AS key FROM bookmarks WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.isNull(row?.key);
            assert.isTrue(
                yield* backfill.terminalizeItem({
                    errorCode: 'test_cleanup',
                    jobId,
                    now: 22_103,
                    state: 'skipped',
                }),
            );
        }),
    );

    it.effect('requeues eligible work orphaned by replacement restore', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const backfill = yield* PreviewBackfillRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 30_000,
                description: null,
                title: 'Restored preview',
                url: 'https://example.com/restored-preview',
            });
            yield* d1.run(
                `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.isTrue(
                yield* backfill.start({
                    itemLimit: 1,
                    now: 31_000,
                    runId: 'preview-run-restore',
                }),
            );
            assert.strictEqual(
                yield* backfill.enqueueBatch({
                    batchLimit: 5,
                    maxInFlight: 10,
                    now: 32_000,
                }),
                1,
            );
            const jobId = `preview-backfill:preview-run-restore:${bookmark.shortUrl}`;
            yield* d1.run(`DELETE FROM outbox WHERE id = ?`, [jobId]);
            yield* backfill.reconcile(33_000);
            let summary = yield* backfill.getSummary;
            assert.strictEqual(summary.pending, 1);
            assert.strictEqual(summary.queued, 0);
            assert.strictEqual(
                yield* backfill.enqueueBatch({
                    batchLimit: 5,
                    maxInFlight: 10,
                    now: 60_032_000,
                }),
                1,
            );
            assert.isTrue(
                yield* backfill.terminalizeItem({
                    errorCode: 'test_cleanup',
                    jobId,
                    now: 60_032_001,
                    state: 'skipped',
                }),
            );
            summary = yield* backfill.getSummary;
            assert.strictEqual(summary.state, 'completed');
            yield* d1.run(`DELETE FROM outbox WHERE id = ?`, [jobId]);
            assert.isAbove(
                yield* backfill.pruneTerminalHistory({
                    completedBefore: 60_032_002,
                    limit: 1,
                }),
                0,
            );
            assert.isNull(
                yield* d1.first(
                    Schema.Struct({ id: Schema.String }),
                    `SELECT id FROM preview_backfill_runs WHERE id = ?`,
                    ['preview-run-restore'],
                ),
            );
        }),
    );
});
