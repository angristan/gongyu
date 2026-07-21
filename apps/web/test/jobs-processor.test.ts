import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    DataRunRepository,
    makeDataRunRepository,
} from '@gongyu/data/data-run-repository';
import {
    MetadataRepository,
    makeMetadataRepository,
} from '@gongyu/data/metadata-repository';
import {
    makePreviewBackfillRepository,
    PreviewBackfillRepository,
} from '@gongyu/data/preview-backfill-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    makeSocialRepository,
    SocialRepository,
} from '@gongyu/data/social-repository';
import {
    makeWorkRepository,
    WorkRepository,
} from '@gongyu/data/work-repository';
import {
    PreviewBackfillQueueMessage,
    QueueJobMessage,
} from '@gongyu/domain/jobs';
import { MetadataCandidate, MetadataError } from '@gongyu/domain/metadata';
import { Settings } from '@gongyu/domain/settings';
import { MetadataClient } from '@gongyu/integrations/metadata-client';
import { makeR2Store, R2Store } from '@gongyu/integrations/r2-store';
import {
    ProviderReceipt,
    SocialClients,
} from '@gongyu/integrations/social-clients';
import {
    ThumbnailClient,
    ValidatedThumbnail,
} from '@gongyu/integrations/thumbnail-client';
import { processQueueJob } from '@gongyu/jobs/processor';
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
            DataRunRepository,
            Effect.gen(function* () {
                return makeDataRunRepository(yield* D1Store);
            }),
        ),
        D1StoreTest,
    ),
    Layer.provide(
        Layer.effect(
            MetadataRepository,
            Effect.gen(function* () {
                return makeMetadataRepository(yield* D1Store);
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
            SocialRepository,
            Effect.gen(function* () {
                return makeSocialRepository(yield* D1Store);
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
    Layer.succeed(MetadataClient, {
        fetch: () =>
            Effect.succeed(
                MetadataCandidate.make({
                    description: 'Extracted summary',
                    imageUrl: null,
                    title: 'Extracted title',
                }),
            ),
    }),
    Layer.succeed(ThumbnailClient, {
        fetch: () => Effect.die(new Error('No image should be fetched.')),
    }),
    Layer.succeed(R2Store, makeR2Store(env.UPLOADS)),
    Layer.succeed(SettingsRepository, {
        get: Effect.succeed(
            Settings.make({
                blueskyAppPassword: '',
                blueskyHandle: '',
                feedCount: 50,
                mastodonAccessToken: 'token',
                mastodonInstance: 'https://social.example',
                twitterAccessSecret: '',
                twitterAccessToken: '',
                twitterApiKey: '',
                twitterApiSecret: '',
            }),
        ),
        save: () => Effect.void,
    }),
    Layer.succeed(SocialClients, {
        deliver: () =>
            Effect.succeed(ProviderReceipt.make({ remoteId: 'remote-123' })),
    }),
);

class StateRow extends Schema.Class<StateRow>('StateRow')({
    state: Schema.String,
}) {}

class BackfillResultRow extends Schema.Class<BackfillResultRow>(
    'BackfillResultRow',
)({
    description: Schema.NullOr(Schema.String),
    itemState: Schema.String,
    metadataState: Schema.String,
    title: Schema.String,
}) {}

it.effect('processes metadata then one immutable social delivery', () =>
    Effect.gen(function* () {
        const bookmarks = yield* BookmarkRepository;
        const d1 = yield* D1Store;
        const bookmark = yield* bookmarks.create({
            createdAt: Date.now() * 1_000 - 1_000,
            description: null,
            socialProviders: ['mastodon'],
            title: 'Submitted title',
            url: 'https://example.com/processor',
        });
        const metadataMessage = QueueJobMessage.make({
            bookmarkShortUrl: bookmark.shortUrl,
            jobId: `metadata:${bookmark.shortUrl}:1`,
            kind: 'metadata',
            version: 1,
        });
        const metadataOutcome = yield* processQueueJob(metadataMessage);
        assert.isNull(metadataOutcome.retryDelaySeconds);
        const metadataJob = yield* d1.first(
            StateRow,
            'SELECT state FROM jobs WHERE id = ?',
            [metadataMessage.jobId],
        );
        assert.strictEqual(metadataJob?.state, 'completed');

        const deliveryId = `social:${bookmark.shortUrl}:mastodon:v1`;
        const delivery = yield* d1.first(
            StateRow,
            'SELECT state FROM social_deliveries WHERE id = ?',
            [deliveryId],
        );
        assert.strictEqual(delivery?.state, 'queued');

        const socialOutcome = yield* processQueueJob(
            QueueJobMessage.make({
                bookmarkShortUrl: bookmark.shortUrl,
                jobId: deliveryId,
                kind: 'social',
                version: 1,
            }),
        );
        assert.isNull(socialOutcome.retryDelaySeconds);
        const delivered = yield* d1.first(
            StateRow,
            'SELECT state FROM social_deliveries WHERE id = ?',
            [deliveryId],
        );
        assert.strictEqual(delivered?.state, 'delivered');
    }).pipe(Effect.provide(TestLayer)),
);

it.effect('backfills previews without changing saved bookmark metadata', () =>
    Effect.gen(function* () {
        const bookmarks = yield* BookmarkRepository;
        const backfill = yield* PreviewBackfillRepository;
        const d1 = yield* D1Store;
        const bookmark = yield* bookmarks.create({
            createdAt: Date.now() * 1_000 - 1_000,
            description: 'Saved description',
            title: 'Saved title',
            url: 'https://example.com/backfill-no-preview',
        });
        yield* d1.run(
            `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
            [bookmark.shortUrl],
        );
        assert.isTrue(
            yield* backfill.start({
                itemLimit: 1,
                now: Date.now() * 1_000,
                runId: 'processor-backfill',
            }),
        );
        assert.strictEqual(
            yield* backfill.enqueueBatch({
                batchLimit: 5,
                maxInFlight: 10,
                now: Date.now() * 1_000,
            }),
            1,
        );
        const message = PreviewBackfillQueueMessage.make({
            bookmarkShortUrl: bookmark.shortUrl,
            jobId: `preview-backfill:processor-backfill:${bookmark.shortUrl}`,
            kind: 'metadata',
            operation: 'preview_backfill',
            runId: 'processor-backfill',
            version: 1,
        });
        const outcome = yield* processQueueJob(message);
        assert.isNull(outcome.retryDelaySeconds);
        const result = yield* d1.first(
            BackfillResultRow,
            `
                SELECT
                    bookmarks.title,
                    bookmarks.description,
                    bookmarks.metadata_state AS "metadataState",
                    items.state AS "itemState"
                FROM bookmarks
                JOIN preview_backfill_items AS items
                    ON items.bookmark_short_url = bookmarks.short_url
                WHERE bookmarks.short_url = ?
            `,
            [bookmark.shortUrl],
        );
        assert.strictEqual(result?.description, 'Saved description');
        assert.strictEqual(result?.itemState, 'no_preview');
        assert.strictEqual(result?.metadataState, 'completed');
        assert.strictEqual(result?.title, 'Saved title');
    }).pipe(Effect.provide(TestLayer)),
);

it.effect(
    'stores a normalized preview without overwriting saved metadata',
    () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const backfill = yield* PreviewBackfillRepository;
            const d1 = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: Date.now() * 1_000,
                description: 'Keep this description',
                title: 'Keep this title',
                url: 'https://example.com/backfill-preview',
            });
            yield* d1.run(
                `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
                [bookmark.shortUrl],
            );
            assert.isTrue(
                yield* backfill.start({
                    itemLimit: 1,
                    now: Date.now() * 1_000,
                    runId: 'processor-preview-backfill',
                }),
            );
            assert.strictEqual(
                yield* backfill.enqueueBatch({
                    batchLimit: 5,
                    maxInFlight: 10,
                    now: Date.now() * 1_000,
                }),
                1,
            );
            const message = PreviewBackfillQueueMessage.make({
                bookmarkShortUrl: bookmark.shortUrl,
                jobId: `preview-backfill:processor-preview-backfill:${bookmark.shortUrl}`,
                kind: 'metadata',
                operation: 'preview_backfill',
                runId: 'processor-preview-backfill',
                version: 1,
            });
            const outcome = yield* processQueueJob(message);
            assert.isNull(outcome.retryDelaySeconds);
            const result = yield* d1.first(
                class PreviewResultRow extends Schema.Class<PreviewResultRow>(
                    'PreviewResultRow',
                )({
                    description: Schema.NullOr(Schema.String),
                    metadataState: Schema.String,
                    sha256: Schema.NullOr(Schema.String),
                    title: Schema.String,
                }) {},
                `
                SELECT
                    title,
                    description,
                    metadata_state AS "metadataState",
                    thumbnail_sha256 AS sha256
                FROM bookmarks
                WHERE short_url = ?
            `,
                [bookmark.shortUrl],
            );
            assert.strictEqual(result?.description, 'Keep this description');
            assert.strictEqual(result?.metadataState, 'completed');
            assert.strictEqual(result?.sha256, 'd'.repeat(64));
            assert.strictEqual(result?.title, 'Keep this title');
        }).pipe(
            Effect.provideService(MetadataClient, {
                fetch: () =>
                    Effect.succeed(
                        MetadataCandidate.make({
                            description: 'Remote description',
                            imageUrl: 'https://images.example/preview.webp',
                            title: 'Remote title',
                        }),
                    ),
            }),
            Effect.provideService(ThumbnailClient, {
                fetch: () =>
                    Effect.succeed(
                        ValidatedThumbnail.make({
                            bytes: new Uint8Array([1, 2, 3]),
                            contentType: 'image/webp',
                            extension: 'webp',
                            height: 80,
                            sha256: 'd'.repeat(64),
                            sourceUrl: 'https://images.example/preview.webp',
                            width: 120,
                        }),
                    ),
            }),
            Effect.provide(TestLayer),
        ),
);

it.effect('caps retryable preview failures at three attempts', () =>
    Effect.gen(function* () {
        const bookmarks = yield* BookmarkRepository;
        const backfill = yield* PreviewBackfillRepository;
        const work = yield* WorkRepository;
        const d1 = yield* D1Store;
        const bookmark = yield* bookmarks.create({
            createdAt: Date.now() * 1_000 + 1_000,
            description: null,
            title: 'Retry preview',
            url: 'https://example.com/backfill-retry',
        });
        yield* d1.run(
            `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
            [bookmark.shortUrl],
        );
        assert.isTrue(
            yield* backfill.start({
                itemLimit: 1,
                now: Date.now() * 1_000,
                runId: 'processor-retry-backfill',
            }),
        );
        assert.strictEqual(
            yield* backfill.enqueueBatch({
                batchLimit: 5,
                maxInFlight: 10,
                now: Date.now() * 1_000,
            }),
            1,
        );
        const message = PreviewBackfillQueueMessage.make({
            bookmarkShortUrl: bookmark.shortUrl,
            jobId: `preview-backfill:processor-retry-backfill:${bookmark.shortUrl}`,
            kind: 'metadata',
            operation: 'preview_backfill',
            runId: 'processor-retry-backfill',
            version: 1,
        });
        for (const expectedDelay of [60, 300, null]) {
            const outcome = yield* processQueueJob(message);
            assert.strictEqual(outcome.retryDelaySeconds, expectedDelay);
            if (expectedDelay !== null) {
                yield* d1.run(`UPDATE jobs SET available_at = 0 WHERE id = ?`, [
                    message.jobId,
                ]);
            }
        }
        const summary = yield* backfill.getSummary;
        assert.strictEqual(summary.failed, 1);
        assert.strictEqual(summary.state, 'completed');
        assert.isFalse(yield* work.retryJob(message.jobId, Date.now() * 1_000));
    }).pipe(
        Effect.provideService(MetadataClient, {
            fetch: () =>
                Effect.fail(
                    MetadataError.make({
                        code: 'metadata_timeout',
                        message: 'Timed out.',
                        retryable: true,
                    }),
                ),
        }),
        Effect.provide(TestLayer),
    ),
);

it.effect('durably defers preview work during portability maintenance', () =>
    Effect.gen(function* () {
        const bookmarks = yield* BookmarkRepository;
        const backfill = yield* PreviewBackfillRepository;
        const runs = yield* DataRunRepository;
        const d1 = yield* D1Store;
        const now = Date.now() * 1_000;
        const bookmark = yield* bookmarks.create({
            createdAt: now,
            description: null,
            title: 'Maintenance preview',
            url: 'https://example.com/maintenance-preview',
        });
        yield* d1.run(
            `UPDATE bookmarks SET metadata_state = 'completed' WHERE short_url = ?`,
            [bookmark.shortUrl],
        );
        assert.isTrue(
            yield* backfill.start({
                itemLimit: 1,
                now,
                runId: 'maintenance',
            }),
        );
        assert.strictEqual(
            yield* backfill.enqueueBatch({
                batchLimit: 5,
                maxInFlight: 10,
                now,
            }),
            1,
        );
        yield* runs.setReadOnly(true, 'restore:test', now + 1);
        const message = QueueJobMessage.make({
            bookmarkShortUrl: 'Missing1',
            jobId: 'metadata:maintenance:1',
            kind: 'metadata',
            version: 1,
        });
        const outcome = yield* processQueueJob(message);
        assert.strictEqual(outcome.retryDelaySeconds, 30);
        const previewMessage = PreviewBackfillQueueMessage.make({
            bookmarkShortUrl: bookmark.shortUrl,
            jobId: `preview-backfill:maintenance:${bookmark.shortUrl}`,
            kind: 'metadata',
            operation: 'preview_backfill',
            runId: 'maintenance',
            version: 1,
        });
        const previewOutcome = yield* processQueueJob(previewMessage);
        assert.isNull(previewOutcome.retryDelaySeconds);
        const summary = yield* backfill.getSummary;
        assert.strictEqual(summary.pending, 1);
        assert.strictEqual(summary.queued, 0);
        const job = yield* d1.first(
            StateRow,
            'SELECT state FROM jobs WHERE id = ?',
            [message.jobId],
        );
        assert.isNull(job);
        const deferredOutbox = yield* d1.first(
            StateRow,
            'SELECT state FROM outbox WHERE id = ?',
            [previewMessage.jobId],
        );
        assert.isNull(deferredOutbox);
        yield* runs.setReadOnly(false, null, Date.now() * 1_000);
    }).pipe(Effect.provide(TestLayer)),
);
