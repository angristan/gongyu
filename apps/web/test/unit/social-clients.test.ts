import { assert, it } from '@effect/vitest';
import { Settings } from '@gongyu/domain/settings';
import { SocialPayloadSnapshot } from '@gongyu/domain/social';
import {
    makeSocialClients,
    ProviderError,
} from '@gongyu/integrations/social-clients';
import { Effect } from 'effect';

const settings = Settings.make({
    blueskyAppPassword: 'app-password',
    blueskyHandle: 'person.test',
    feedCount: 50,
    libraryName: 'Gongyu',
    mastodonAccessToken: 'mastodon-token',
    mastodonInstance: 'https://social.example/',
    twitterAccessSecret: 'access-secret',
    twitterAccessToken: 'access-token',
    twitterApiKey: 'api-key',
    twitterApiSecret: 'api-secret',
    twitterDeliveryMode: 'api',
});

const payload = SocialPayloadSnapshot.make({
    blueskyByteEnd: 37,
    blueskyByteStart: 6,
    blueskyCreatedAt: '2025-01-01T00:00:00.000Z',
    description: 'Description',
    finalizedAt: 1_735_689_600_000_000,
    formattedText: 'Title https://example.com/article',
    originalUrl: 'https://example.com/article',
    r2ThumbnailKey: null,
    schemaVersion: 1,
    shortUrl: 'AbCd1234',
    title: 'Title',
});

it.effect('uses deterministic Mastodon idempotency keys', () =>
    Effect.gen(function* () {
        const requests: Request[] = [];
        const clients = makeSocialClients({
            fetchImplementation: async (input, init) => {
                requests.push(new Request(input, init));
                return Response.json({ id: 'status-123' });
            },
        });
        const receipt = yield* clients.deliver({
            deliveryId: 'social:AbCd1234:mastodon:v1',
            payload,
            provider: 'mastodon',
            settings,
            thumbnail: null,
        });
        assert.strictEqual(receipt.remoteId, 'status-123');
        const request = requests[0];
        assert.strictEqual(
            request.url,
            'https://social.example/api/v1/statuses',
        );
        assert.strictEqual(
            request.headers.get('Idempotency-Key'),
            'social:AbCd1234:mastodon:v1',
        );
    }),
);

it.effect('uses deterministic Bluesky rkeys and immutable facets', () =>
    Effect.gen(function* () {
        const requests: Request[] = [];
        const clients = makeSocialClients({
            fetchImplementation: async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);
                if (request.url.endsWith('createSession')) {
                    return Response.json({
                        accessJwt: 'jwt',
                        did: 'did:plc:person',
                    });
                }
                return Response.json({
                    uri: 'at://did:plc:person/app.bsky.feed.post/gongyu-abcd1234-v1',
                });
            },
        });
        const receipt = yield* clients.deliver({
            deliveryId: 'social:AbCd1234:bluesky:v1',
            payload,
            provider: 'bluesky',
            settings,
            thumbnail: null,
        });
        assert.match(receipt.remoteId, /gongyu-abcd1234-v1$/u);
        const create = requests.find((request) =>
            request.url.endsWith('createRecord'),
        );
        assert.isDefined(create);
        const body = (yield* Effect.promise(() => create.json())) as {
            rkey: string;
            record: {
                facets: Array<{
                    index: { byteEnd: number; byteStart: number };
                }>;
            };
        };
        assert.strictEqual(body.rkey, 'gongyu-AbCd1234-v1');
        assert.deepEqual(body.record.facets[0].index, {
            byteEnd: 37,
            byteStart: 6,
        });
    }),
);

it.effect('reconciles an existing deterministic Bluesky record', () =>
    Effect.gen(function* () {
        const clients = makeSocialClients({
            fetchImplementation: async (input) => {
                const url = input.toString();
                if (url.includes('createSession')) {
                    return Response.json({
                        accessJwt: 'jwt',
                        did: 'did:plc:person',
                    });
                }
                if (url.includes('createRecord')) {
                    return Response.json(
                        { error: 'InvalidRequest' },
                        { status: 400 },
                    );
                }
                if (url.includes('getRecord')) {
                    return Response.json({
                        value: {
                            embed: {
                                external: {
                                    uri: payload.originalUrl,
                                },
                            },
                            text: payload.formattedText,
                        },
                    });
                }
                return new Response('Not found', { status: 404 });
            },
        });
        const receipt = yield* clients.deliver({
            deliveryId: 'social:AbCd1234:bluesky:v1',
            payload,
            provider: 'bluesky',
            settings,
            thumbnail: null,
        });
        assert.strictEqual(
            receipt.remoteId,
            'at://did:plc:person/app.bsky.feed.post/gongyu-AbCd1234-v1',
        );
    }),
);

it.effect('never automatically retries ambiguous Twitter writes', () =>
    Effect.gen(function* () {
        const clients = makeSocialClients({
            fetchImplementation: () => Promise.reject(new Error('timeout')),
            nonce: () => 'fixed-nonce',
            now: () => 1_735_689_600_000,
        });
        const failure = yield* clients
            .deliver({
                deliveryId: 'social:AbCd1234:twitter:v1',
                payload,
                provider: 'twitter',
                settings,
                thumbnail: null,
            })
            .pipe(Effect.flip);
        assert.instanceOf(failure, ProviderError);
        if (failure instanceof ProviderError) {
            assert.strictEqual(failure.code, 'transport_ambiguous');
            assert.isTrue(failure.ambiguous);
            assert.isFalse(failure.retryable);
        }
    }),
);
