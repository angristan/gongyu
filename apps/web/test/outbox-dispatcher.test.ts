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
import type { QueueJobMessage } from '@gongyu/domain/jobs';
import {
    QueueProducer,
    QueueProducerError,
} from '@gongyu/integrations/queue-producer';
import { dispatchBookmarkOutbox } from '@gongyu/jobs/outbox-dispatcher';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.succeed(
    D1Store,
    makeD1Store(env.DB.withSession('first-primary')),
);
const BookmarkRepositoryTest = Layer.effect(
    BookmarkRepository,
    Effect.gen(function* () {
        return makeBookmarkRepository(yield* D1Store);
    }),
).pipe(Layer.provide(D1StoreTest));
const WorkRepositoryTest = Layer.effect(
    WorkRepository,
    Effect.gen(function* () {
        return makeWorkRepository(yield* D1Store);
    }),
).pipe(Layer.provide(D1StoreTest));

let failedSends = 0;
const sentMessages: QueueJobMessage[] = [];
const QueueProducerTest = Layer.succeed(QueueProducer, {
    send: (message) =>
        Effect.suspend(() => {
            if (failedSends > 0) {
                failedSends -= 1;
                return Effect.fail(
                    QueueProducerError.make({
                        message: 'Injected Queue failure.',
                    }),
                );
            }
            sentMessages.push(message);
            return Effect.void;
        }),
});
const TestLayer = Layer.mergeAll(
    D1StoreTest,
    BookmarkRepositoryTest,
    WorkRepositoryTest,
    QueueProducerTest,
);

class OutboxRow extends Schema.Class<OutboxRow>('OutboxRow')({
    attempts: Schema.Number,
    lastErrorCode: Schema.NullOr(Schema.String),
    state: Schema.String,
}) {}

it.layer(TestLayer)('outbox dispatcher', (it) => {
    it.effect('dispatches pending work immediately and only once', () =>
        Effect.gen(function* () {
            failedSends = 0;
            sentMessages.length = 0;
            const bookmarks = yield* BookmarkRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: Date.now() * 1_000,
                description: null,
                title: 'Immediate dispatch',
                url: `https://example.com/immediate-${crypto.randomUUID()}`,
            });

            const first = yield* dispatchBookmarkOutbox({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
            });
            const duplicate = yield* dispatchBookmarkOutbox({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
            });
            const outbox = yield* d1.first(
                OutboxRow,
                `
                    SELECT
                        state,
                        attempts,
                        last_error_code AS "lastErrorCode"
                    FROM outbox
                    WHERE id = ?
                `,
                [`metadata:${bookmark.shortUrl}:1`],
            );

            assert.strictEqual(first.claimed, 1);
            assert.strictEqual(first.dispatched, 1);
            assert.strictEqual(first.failed, 0);
            assert.strictEqual(first.remaining, 0);
            assert.strictEqual(duplicate.claimed, 0);
            assert.strictEqual(duplicate.dispatched, 0);
            assert.strictEqual(duplicate.failed, 0);
            assert.strictEqual(duplicate.remaining, 0);
            assert.lengthOf(sentMessages, 1);
            assert.strictEqual(sentMessages[0]?.kind, 'metadata');
            assert.strictEqual(outbox?.state, 'completed');
            assert.strictEqual(outbox?.attempts, 1);
            assert.isNull(outbox?.lastErrorCode);
        }),
    );

    it.effect('reports work claimed by another dispatcher as outstanding', () =>
        Effect.gen(function* () {
            failedSends = 0;
            sentMessages.length = 0;
            const bookmarks = yield* BookmarkRepository;
            const work = yield* WorkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: Date.now() * 1_000,
                description: null,
                title: 'Concurrent dispatch',
                url: `https://example.com/concurrent-${crypto.randomUUID()}`,
            });
            const now = Date.now() * 1_000;
            const claimed = yield* work.claimOutboxForBookmark({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
                leaseDurationMicros: 60 * 1_000_000,
                limit: 1,
                now,
                token: 'other-dispatcher',
            });

            const dispatch = yield* dispatchBookmarkOutbox({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
            });

            assert.lengthOf(claimed, 1);
            assert.strictEqual(dispatch.claimed, 0);
            assert.strictEqual(dispatch.dispatched, 0);
            assert.strictEqual(dispatch.remaining, 1);
            assert.lengthOf(sentMessages, 0);
        }),
    );

    it.effect('releases failed sends for a later idempotent retry', () =>
        Effect.gen(function* () {
            failedSends = 1;
            sentMessages.length = 0;
            const bookmarks = yield* BookmarkRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: Date.now() * 1_000,
                description: null,
                title: 'Recovered dispatch',
                url: `https://example.com/recovered-${crypto.randomUUID()}`,
            });
            const outboxId = `metadata:${bookmark.shortUrl}:1`;

            const failed = yield* dispatchBookmarkOutbox({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
            });
            const released = yield* d1.first(
                OutboxRow,
                `
                    SELECT
                        state,
                        attempts,
                        last_error_code AS "lastErrorCode"
                    FROM outbox
                    WHERE id = ?
                `,
                [outboxId],
            );
            yield* d1.run('UPDATE outbox SET available_at = 0 WHERE id = ?', [
                outboxId,
            ]);
            const recovered = yield* dispatchBookmarkOutbox({
                bookmarkShortUrl: bookmark.shortUrl,
                kind: 'metadata',
            });
            const completed = yield* d1.first(
                OutboxRow,
                `
                    SELECT
                        state,
                        attempts,
                        last_error_code AS "lastErrorCode"
                    FROM outbox
                    WHERE id = ?
                `,
                [outboxId],
            );

            assert.strictEqual(failed.failed, 1);
            assert.strictEqual(failed.remaining, 1);
            assert.strictEqual(released?.state, 'pending');
            assert.strictEqual(
                released?.lastErrorCode,
                'queue_dispatch_failed',
            );
            assert.strictEqual(recovered.dispatched, 1);
            assert.strictEqual(recovered.remaining, 0);
            assert.lengthOf(sentMessages, 1);
            assert.strictEqual(completed?.state, 'completed');
            assert.strictEqual(completed?.attempts, 2);
        }),
    );
});
