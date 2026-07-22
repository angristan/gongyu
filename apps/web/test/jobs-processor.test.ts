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
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    makeSocialRepository,
    SocialRepository,
} from '@gongyu/data/social-repository';
import {
    makeWorkRepository,
    WorkRepository,
} from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { MetadataCandidate } from '@gongyu/domain/metadata';
import { Settings } from '@gongyu/domain/settings';
import { SocialPayloadSnapshot } from '@gongyu/domain/social';
import { MetadataClient } from '@gongyu/integrations/metadata-client';
import { makeR2Store, R2Store } from '@gongyu/integrations/r2-store';
import {
    ProviderReceipt,
    SocialClients,
} from '@gongyu/integrations/social-clients';
import { ThumbnailClient } from '@gongyu/integrations/thumbnail-client';
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
                libraryName: 'Gongyu',
                mastodonAccessToken: 'token',
                mastodonInstance: 'https://social.example',
                twitterAccessSecret: '',
                twitterAccessToken: '',
                twitterApiKey: '',
                twitterApiSecret: '',
            }),
        ),
        getLibraryName: Effect.succeed('Gongyu'),
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

class SocialPayloadRow extends Schema.Class<SocialPayloadRow>(
    'SocialPayloadRow',
)({
    payloadJson: Schema.String,
    state: Schema.String,
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
            SocialPayloadRow,
            `
                SELECT state, payload_json AS "payloadJson"
                FROM social_deliveries
                WHERE id = ?
            `,
            [deliveryId],
        );
        assert.strictEqual(delivery?.state, 'queued');
        const payload = yield* Schema.decodeUnknownEffect(
            SocialPayloadSnapshot,
        )(JSON.parse(delivery?.payloadJson ?? 'null'));
        assert.strictEqual(payload.title, 'Submitted title');
        assert.strictEqual(payload.description, '');

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

it.effect(
    'resumes social staging after metadata committed before a crash',
    () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const metadata = yield* MetadataRepository;
            const d1 = yield* D1Store;
            const now = Date.now() * 1_000;
            const bookmark = yield* bookmarks.create({
                createdAt: now,
                description: 'Crash-safe source',
                socialProviders: ['mastodon'],
                title: 'Crash-safe title',
                url: `https://example.com/crash-safe-${crypto.randomUUID()}`,
            });
            const finalized = yield* metadata.finalize({
                candidate: MetadataCandidate.make({
                    description: null,
                    imageUrl: null,
                    title: 'Fetched title',
                }),
                errorCode: null,
                expectedUpdatedAt: bookmark.updatedAt,
                now: now + 1_000,
                shortUrl: bookmark.shortUrl,
                thumbnail: null,
                thumbnailSourceUrl: null,
            });
            assert.isTrue(finalized);

            const outcome = yield* processQueueJob(
                QueueJobMessage.make({
                    bookmarkShortUrl: bookmark.shortUrl,
                    jobId: `metadata:${bookmark.shortUrl}:1`,
                    kind: 'metadata',
                    version: 1,
                }),
            );
            const delivery = yield* d1.first(
                StateRow,
                'SELECT state FROM social_deliveries WHERE bookmark_short_url = ?',
                [bookmark.shortUrl],
            );

            assert.isNull(outcome.retryDelaySeconds);
            assert.strictEqual(delivery?.state, 'queued');
        }).pipe(Effect.provide(TestLayer)),
);

it.effect('retries queued work while portability maintenance is active', () =>
    Effect.gen(function* () {
        const runs = yield* DataRunRepository;
        const d1 = yield* D1Store;
        yield* runs.setReadOnly(true, 'restore:test', Date.now() * 1_000);
        const message = QueueJobMessage.make({
            bookmarkShortUrl: 'Missing1',
            jobId: 'metadata:maintenance:1',
            kind: 'metadata',
            version: 1,
        });
        const outcome = yield* processQueueJob(message);
        assert.strictEqual(outcome.retryDelaySeconds, 30);
        const job = yield* d1.first(
            StateRow,
            'SELECT state FROM jobs WHERE id = ?',
            [message.jobId],
        );
        assert.isNull(job);
        yield* runs.setReadOnly(false, null, Date.now() * 1_000);
    }).pipe(Effect.provide(TestLayer)),
);
