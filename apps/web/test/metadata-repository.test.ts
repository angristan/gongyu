import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    MetadataRepository,
    makeMetadataRepository,
} from '@gongyu/data/metadata-repository';
import { MetadataCandidate } from '@gongyu/domain/metadata';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const BookmarkRepositoryTest = Layer.effect(BookmarkRepository)(
    Effect.gen(function* () {
        const d1 = yield* D1Store;
        return makeBookmarkRepository(d1);
    }),
);
const MetadataRepositoryTest = Layer.effect(MetadataRepository)(
    Effect.gen(function* () {
        const d1 = yield* D1Store;
        return makeMetadataRepository(d1);
    }),
);
const TestLayer = Layer.mergeAll(
    D1StoreTest,
    Layer.provide(BookmarkRepositoryTest, D1StoreTest),
    Layer.provide(MetadataRepositoryTest, D1StoreTest),
);

class DeliveryRow extends Schema.Class<DeliveryRow>('DeliveryRow')({
    payloadJson: Schema.NullOr(Schema.String),
    provider: Schema.String,
    sourceJson: Schema.String,
    state: Schema.String,
}) {}

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}

it.layer(TestLayer)('metadata lifecycle repository', (it) => {
    it.effect('finalizes metadata without mutating frozen social intents', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const metadata = yield* MetadataRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 1_000,
                description: null,
                socialProviders: ['twitter', 'mastodon', 'bluesky'],
                title: 'Submitted title',
                url: 'https://example.com/original',
            });
            yield* bookmarks.update({
                description: 'Edited later',
                shortUrl: bookmark.shortUrl,
                title: 'Edited title',
                updatedAt: 2_000,
                url: bookmark.url,
            });

            const waiting = yield* d1.query(
                DeliveryRow,
                `
                        SELECT
                            provider,
                            state,
                            source_json AS "sourceJson",
                            payload_json AS "payloadJson"
                        FROM social_deliveries
                        WHERE bookmark_short_url = ?
                        ORDER BY provider
                    `,
                [bookmark.shortUrl],
            );
            assert.lengthOf(waiting.rows, 3);
            assert.isTrue(
                waiting.rows.every(
                    (delivery) => delivery.state === 'waiting_metadata',
                ),
            );
            assert.isTrue(
                waiting.rows.every(
                    (delivery) =>
                        JSON.parse(delivery.sourceJson).title ===
                        'Submitted title',
                ),
            );

            yield* metadata.finalize({
                candidate: MetadataCandidate.make({
                    description: 'Extracted description',
                    imageUrl: null,
                    title: 'Extracted title',
                }),
                errorCode: null,
                expectedUpdatedAt: 2_000,
                now: 3_000,
                shortUrl: bookmark.shortUrl,
                thumbnail: null,
                thumbnailSourceUrl: null,
            });
            const finalized = yield* d1.query(
                DeliveryRow,
                `
                        SELECT
                            provider,
                            state,
                            source_json AS "sourceJson",
                            payload_json AS "payloadJson"
                        FROM social_deliveries
                        WHERE bookmark_short_url = ?
                    `,
                [bookmark.shortUrl],
            );
            assert.isTrue(
                finalized.rows.every(
                    (delivery) =>
                        delivery.state === 'waiting_metadata' &&
                        delivery.payloadJson === null,
                ),
            );
            const socialOutbox = yield* d1.first(
                CountRow,
                `
                        SELECT COUNT(*) AS count
                        FROM outbox
                        WHERE bookmark_short_url = ? AND kind = 'social'
                    `,
                [bookmark.shortUrl],
            );
            assert.strictEqual(socialOutbox?.count, 0);
        }),
    );

    it.effect('rejects stale finalization after a concurrent edit', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const metadata = yield* MetadataRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 5_000,
                description: null,
                socialProviders: ['twitter'],
                title: 'Before edit',
                url: 'https://example.com/before-edit',
            });
            yield* bookmarks.update({
                description: null,
                shortUrl: bookmark.shortUrl,
                title: 'After edit',
                updatedAt: 6_000,
                url: 'https://example.com/after-edit',
            });
            const finalized = yield* metadata.finalize({
                candidate: MetadataCandidate.make({
                    description: null,
                    imageUrl: 'https://example.com/stale.png',
                    title: 'Stale metadata',
                }),
                errorCode: null,
                expectedUpdatedAt: 5_000,
                now: 7_000,
                shortUrl: bookmark.shortUrl,
                thumbnail: null,
                thumbnailSourceUrl: 'https://example.com/stale.png',
            });
            assert.isNull(finalized);
            const delivery = yield* d1.first(
                DeliveryRow,
                `
                    SELECT
                        provider,
                        state,
                        source_json AS "sourceJson",
                        payload_json AS "payloadJson"
                    FROM social_deliveries
                    WHERE bookmark_short_url = ?
                `,
                [bookmark.shortUrl],
            );
            assert.strictEqual(delivery?.state, 'waiting_metadata');
            assert.isNull(delivery?.payloadJson);
        }),
    );

    it.effect('releases social intents after terminal metadata failure', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const metadata = yield* MetadataRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 10_000,
                description: 'Submitted description',
                socialProviders: ['mastodon'],
                title: 'Fallback title',
                url: 'https://example.com/failure',
            });
            yield* metadata.finalize({
                candidate: null,
                errorCode: 'unsupported_content_type',
                expectedUpdatedAt: 10_000,
                now: 11_000,
                shortUrl: bookmark.shortUrl,
                thumbnail: null,
                thumbnailSourceUrl: null,
            });
            const row = yield* d1.first(
                DeliveryRow,
                `
                    SELECT
                        provider,
                        state,
                        source_json AS "sourceJson",
                        payload_json AS "payloadJson"
                    FROM social_deliveries
                    WHERE bookmark_short_url = ?
                `,
                [bookmark.shortUrl],
            );
            assert.strictEqual(row?.state, 'waiting_metadata');
            assert.isNull(row?.payloadJson);
        }),
    );
});
