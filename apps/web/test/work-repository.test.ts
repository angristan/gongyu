import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    makeWorkRepository,
    WorkRepository,
} from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const BookmarkRepositoryTest = Layer.effect(BookmarkRepository)(
    Effect.gen(function* () {
        return makeBookmarkRepository(yield* D1Store);
    }),
);
const WorkRepositoryTest = Layer.effect(WorkRepository)(
    Effect.gen(function* () {
        return makeWorkRepository(yield* D1Store);
    }),
);
class StateRow extends Schema.Class<StateRow>('StateRow')({
    state: Schema.String,
}) {}

const TestLayer = Layer.mergeAll(
    D1StoreTest,
    Layer.provide(BookmarkRepositoryTest, D1StoreTest),
    Layer.provide(WorkRepositoryTest, D1StoreTest),
);

it.layer(TestLayer)('durable work repository', (it) => {
    it.effect('fences outbox completion and reclaims expired dispatches', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 1_000,
                description: null,
                title: 'Lease target',
                url: 'https://example.com/lease-target',
            });
            const first = yield* work.claimOutbox({
                leaseDurationMicros: 100,
                limit: 10,
                now: 2_000,
                token: 'first-token',
            });
            assert.lengthOf(first, 1);
            const concurrent = yield* work.claimOutbox({
                leaseDurationMicros: 100,
                limit: 10,
                now: 2_050,
                token: 'second-token',
            });
            assert.lengthOf(concurrent, 0);
            const reclaimed = yield* work.claimOutbox({
                leaseDurationMicros: 100,
                limit: 10,
                now: 2_101,
                token: 'second-token',
            });
            assert.lengthOf(reclaimed, 1);
            assert.isFalse(
                yield* work.completeOutbox({
                    id: first[0].id,
                    now: 2_102,
                    token: 'first-token',
                }),
            );
            assert.isTrue(
                yield* work.completeOutbox({
                    id: reclaimed[0].id,
                    now: 2_102,
                    token: 'second-token',
                }),
            );
            assert.strictEqual(
                reclaimed[0].bookmarkShortUrl,
                bookmark.shortUrl,
            );
        }),
    );

    it.effect('requeues both failed social jobs and deliveries', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const work = yield* WorkRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 3_000,
                description: null,
                socialProviders: ['mastodon'],
                title: 'Social retry',
                url: 'https://example.com/social-retry',
            });
            const id = `social:${bookmark.shortUrl}:mastodon:v1`;
            yield* d1.batch([
                {
                    sql: `
                        UPDATE social_deliveries
                        SET state = 'failed', last_error_code = 'http_503'
                        WHERE id = ?
                    `,
                    parameters: [id],
                },
                {
                    sql: `
                        INSERT INTO outbox (
                            id, bookmark_short_url, kind, state,
                            payload_version, created_at, updated_at
                        )
                        VALUES (?, ?, 'social', 'completed', 1, ?, ?)
                    `,
                    parameters: [id, bookmark.shortUrl, 3_001, 3_001],
                },
                {
                    sql: `
                        INSERT INTO jobs (
                            id, outbox_id, bookmark_short_url, kind, state,
                            payload_version, available_at, created_at, updated_at
                        )
                        VALUES (?, ?, ?, 'social', 'failed', 1, ?, ?, ?)
                    `,
                    parameters: [
                        id,
                        id,
                        bookmark.shortUrl,
                        3_001,
                        3_001,
                        3_001,
                    ],
                },
            ]);
            assert.isTrue(yield* work.retryJob(id, 4_000));
            const delivery = yield* d1.first(
                StateRow,
                'SELECT state FROM social_deliveries WHERE id = ?',
                [id],
            );
            const job = yield* d1.first(
                StateRow,
                'SELECT state FROM jobs WHERE id = ?',
                [id],
            );
            assert.strictEqual(delivery?.state, 'retrying');
            assert.strictEqual(job?.state, 'retrying');
        }),
    );

    it.effect('terminalizes active DLQ jobs and ignores deleted targets', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 4_500,
                description: null,
                title: 'DLQ target',
                url: 'https://example.com/dlq-target',
            });
            const message = QueueJobMessage.make({
                bookmarkShortUrl: bookmark.shortUrl,
                jobId: `metadata:${bookmark.shortUrl}:1`,
                kind: 'metadata',
                version: 1,
            });
            yield* work.ensureJob(message, 4_600);
            assert.isNotNull(
                yield* work.claimJob({
                    id: message.jobId,
                    leaseDurationMicros: 1_000_000,
                    now: 4_600,
                    token: 'active-token',
                }),
            );
            yield* work.terminalizeDeadLetter(message.jobId, 4_700);
            assert.strictEqual(
                (yield* work.getJobStatus(message.jobId))?.state,
                'failed',
            );

            assert.isTrue(yield* bookmarks.remove(bookmark.shortUrl));
            yield* work.ensureJob(message, 4_800);
            assert.isNull(yield* work.getJobStatus(message.jobId));
        }),
    );

    it.effect('makes duplicate Queue deliveries side-effect free', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 5_000,
                description: null,
                title: 'Queue target',
                url: 'https://example.com/queue-target',
            });
            const message = QueueJobMessage.make({
                bookmarkShortUrl: bookmark.shortUrl,
                jobId: `metadata:${bookmark.shortUrl}:1`,
                kind: 'metadata',
                version: 1,
            });
            yield* work.ensureJob(message, 6_000);
            yield* work.ensureJob(message, 6_000);
            const lease = yield* work.claimJob({
                id: message.jobId,
                leaseDurationMicros: 100,
                now: 6_000,
                token: 'job-token',
            });
            assert.isNotNull(lease);
            assert.isTrue(
                yield* work.completeJob({
                    id: message.jobId,
                    now: 6_050,
                    token: 'job-token',
                }),
            );
            assert.isNull(
                yield* work.claimJob({
                    id: message.jobId,
                    leaseDurationMicros: 100,
                    now: 6_200,
                    token: 'duplicate-token',
                }),
            );
        }),
    );
});
