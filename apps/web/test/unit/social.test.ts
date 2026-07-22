import { assert, it } from '@effect/vitest';
import { Settings } from '@gongyu/domain/settings';
import {
    configuredProviders,
    formatSocialPayload,
    twitterWebIntentUrl,
} from '@gongyu/domain/social';
import { Effect } from 'effect';

const emptySettings = Settings.make({
    blueskyAppPassword: '',
    blueskyHandle: '',
    feedCount: 50,
    libraryName: 'Gongyu',
    mastodonAccessToken: '',
    mastodonInstance: '',
    twitterAccessSecret: '',
    twitterAccessToken: '',
    twitterApiKey: '',
    twitterApiSecret: '',
    twitterDeliveryMode: 'disabled',
});

it.effect('requires complete trimmed provider credentials', () =>
    Effect.sync(() => {
        assert.deepEqual(configuredProviders(emptySettings), []);
        assert.deepEqual(
            configuredProviders(
                Settings.make({
                    ...emptySettings,
                    blueskyAppPassword: 'password',
                    blueskyHandle: 'handle.test',
                    mastodonAccessToken: 'token',
                    mastodonInstance: 'https://social.example',
                    twitterAccessSecret: 'access-secret',
                    twitterAccessToken: 'access-token',
                    twitterApiKey: 'key',
                    twitterApiSecret: 'secret',
                    twitterDeliveryMode: 'api',
                }),
            ),
            ['twitter', 'mastodon', 'bluesky'],
        );
        assert.deepEqual(
            configuredProviders(
                Settings.make({
                    ...emptySettings,
                    twitterAccessSecret: 'access-secret',
                    twitterAccessToken: 'access-token',
                    twitterApiKey: '   ',
                    twitterApiSecret: 'secret',
                }),
            ),
            [],
        );
    }),
);

it.effect('keeps manual Twitter out of automated delivery', () =>
    Effect.sync(() => {
        const settings = Settings.make({
            ...emptySettings,
            twitterAccessSecret: 'access-secret',
            twitterAccessToken: 'access-token',
            twitterApiKey: 'key',
            twitterApiSecret: 'secret',
            twitterDeliveryMode: 'manual',
        });
        assert.deepEqual(configuredProviders(settings), []);
    }),
);

it.effect('builds a bounded encoded X Web Intent', () =>
    Effect.sync(() => {
        const intent = new URL(
            twitterWebIntentUrl({
                originalUrl: 'https://example.com/article?a=1&b=2',
                title: '😀'.repeat(300),
            }),
        );
        assert.strictEqual(intent.origin, 'https://x.com');
        assert.strictEqual(intent.pathname, '/intent/tweet');
        assert.strictEqual(
            intent.searchParams.get('url'),
            'https://example.com/article?a=1&b=2',
        );
        const title = intent.searchParams.get('text') ?? '';
        assert.strictEqual(Array.from(title).length, 256);
        assert.strictEqual(Array.from(title).at(-1), '…');
    }),
);

it.effect('formats Twitter with its fixed URL weight and code points', () =>
    Effect.gen(function* () {
        const payload = yield* formatSocialPayload({
            description: '',
            finalizedAt: 1_735_689_600_000_000,
            originalUrl: 'https://example.com/a-very-long-url',
            provider: 'twitter',
            r2ThumbnailKey: null,
            shortUrl: 'AbCd1234',
            title: '😀'.repeat(257),
        });
        const title = payload.formattedText.split(' ')[0];
        assert.strictEqual(Array.from(title).length, 256);
        assert.strictEqual(Array.from(title).at(-1), '…');
        assert.match(payload.formattedText, / https:\/\/example\.com/u);
    }),
);

it.effect('computes Bluesky facets from UTF-8 bytes', () =>
    Effect.gen(function* () {
        const url = 'https://example.com/é';
        const payload = yield* formatSocialPayload({
            description: 'Description',
            finalizedAt: 1_735_689_600_000_000,
            originalUrl: url,
            provider: 'bluesky',
            r2ThumbnailKey: 'thumbnails/key.webp',
            shortUrl: 'AbCd1234',
            title: '你好 😀',
        });
        const prefix = '你好 😀 ';
        assert.strictEqual(
            payload.blueskyByteStart,
            new TextEncoder().encode(prefix).byteLength,
        );
        assert.strictEqual(
            payload.blueskyByteEnd,
            new TextEncoder().encode(`${prefix}${url}`).byteLength,
        );
        assert.strictEqual(
            payload.blueskyCreatedAt,
            '2025-01-01T00:00:00.000Z',
        );
    }),
);

it.effect('rejects URLs that leave no provider title budget', () =>
    Effect.gen(function* () {
        const error = yield* formatSocialPayload({
            description: '',
            finalizedAt: 1,
            originalUrl: `https://example.com/${'x'.repeat(500)}`,
            provider: 'mastodon',
            r2ThumbnailKey: null,
            shortUrl: 'AbCd1234',
            title: 'Title',
        }).pipe(Effect.flip);
        assert.strictEqual(error.code, 'payload_too_long');
    }),
);
