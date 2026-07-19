import type { Settings } from '@gongyu/domain/settings';
import type {
    SocialPayloadSnapshot,
    SocialProvider,
} from '@gongyu/domain/social';
import { Context, Effect, Schema } from 'effect';
import type { MetadataFetch } from './metadata-client';

export class ProviderError extends Schema.TaggedErrorClass<ProviderError>()(
    'ProviderError',
    {
        ambiguous: Schema.Boolean,
        code: Schema.String,
        provider: Schema.String,
        retryable: Schema.Boolean,
    },
) {}

export class ProviderReceipt extends Schema.Class<ProviderReceipt>(
    'ProviderReceipt',
)({
    remoteId: Schema.String,
}) {}

export interface SocialClientsShape {
    readonly deliver: (input: {
        readonly deliveryId: string;
        readonly payload: SocialPayloadSnapshot;
        readonly provider: SocialProvider;
        readonly settings: Settings;
        readonly thumbnail: {
            readonly bytes: Uint8Array;
            readonly contentType: string;
        } | null;
    }) => Effect.Effect<ProviderReceipt, ProviderError>;
}

export class SocialClients extends Context.Service<
    SocialClients,
    SocialClientsShape
>()('@gongyu/integrations/SocialClients') {}

function error(
    provider: SocialProvider,
    code: string,
    retryable: boolean,
    ambiguous = false,
): ProviderError {
    return ProviderError.make({ ambiguous, code, provider, retryable });
}

function encode(value: string): string {
    return encodeURIComponent(value).replace(
        /[!'()*]/gu,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

function base64(bytes: ArrayBuffer): string {
    let binary = '';
    for (const byte of new Uint8Array(bytes)) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

async function twitterAuthorization(input: {
    readonly accessSecret: string;
    readonly accessToken: string;
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly nonce: string;
    readonly timestamp: number;
}): Promise<string> {
    const url = 'https://api.twitter.com/2/tweets';
    const parameters: Record<string, string> = {
        oauth_consumer_key: input.apiKey,
        oauth_nonce: input.nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: String(input.timestamp),
        oauth_token: input.accessToken,
        oauth_version: '1.0',
    };
    const normalized = Object.entries(parameters)
        .map(([key, value]) => [encode(key), encode(value)] as const)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
    const signatureBase = `POST&${encode(url)}&${encode(normalized)}`;
    const signingKey = `${encode(input.apiSecret)}&${encode(input.accessSecret)}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(signingKey),
        { hash: 'SHA-1', name: 'HMAC' },
        false,
        ['sign'],
    );
    const signature = base64(
        await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(signatureBase),
        ),
    );
    return `OAuth ${Object.entries({
        ...parameters,
        oauth_signature: signature,
    })
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
        .join(', ')}`;
}

const PROVIDER_TIMEOUT_MS = 15_000;
const PROVIDER_JSON_LIMIT_BYTES = 65_536;

async function fetchWithTimeout(
    fetchImplementation: MetadataFetch,
    input: RequestInfo | URL,
    init: RequestInit,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        return await fetchImplementation(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function decodeJson(response: Response): Promise<unknown> {
    const declared = Number.parseInt(
        response.headers.get('Content-Length') ?? '0',
        10,
    );
    if (declared > PROVIDER_JSON_LIMIT_BYTES || response.body === null) {
        return null;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + 5_000;
    let size = 0;
    let text = '';
    try {
        while (true) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                return null;
            }
            let timeout: ReturnType<typeof setTimeout> | undefined;
            const result = await Promise.race([
                reader.read(),
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error('Provider body timed out.')),
                        remaining,
                    );
                }),
            ]).finally(() => {
                if (timeout !== undefined) {
                    clearTimeout(timeout);
                }
            });
            if (result.done) {
                text += decoder.decode();
                return JSON.parse(text) as unknown;
            }
            size += result.value.byteLength;
            if (size > PROVIDER_JSON_LIMIT_BYTES) {
                return null;
            }
            text += decoder.decode(result.value, { stream: true });
        }
    } catch {
        return null;
    } finally {
        if (size > PROVIDER_JSON_LIMIT_BYTES || Date.now() >= deadline) {
            await reader.cancel().catch(() => undefined);
        }
    }
}

function stringAt(
    value: unknown,
    first: string,
    second?: string,
): string | null {
    if (typeof value !== 'object' || value === null || !(first in value)) {
        return null;
    }
    const nested = (value as Record<string, unknown>)[first];
    if (second === undefined) {
        return typeof nested === 'string' ? nested : null;
    }
    if (typeof nested !== 'object' || nested === null || !(second in nested)) {
        return null;
    }
    const result = (nested as Record<string, unknown>)[second];
    return typeof result === 'string' ? result : null;
}

export function makeSocialClients(options?: {
    readonly fetchImplementation?: MetadataFetch;
    readonly nonce?: () => string;
    readonly now?: () => number;
}): SocialClientsShape {
    const fetchImplementation = options?.fetchImplementation ?? fetch;
    const nonce = options?.nonce ?? (() => crypto.randomUUID());
    const now = options?.now ?? (() => Date.now());

    const deliverTwitter = Effect.fn('SocialClients.twitter')(
        function* (input: {
            readonly payload: SocialPayloadSnapshot;
            readonly settings: Settings;
        }) {
            const provider = 'twitter' as const;
            const authorization = yield* Effect.tryPromise({
                try: () =>
                    twitterAuthorization({
                        accessSecret: input.settings.twitterAccessSecret,
                        accessToken: input.settings.twitterAccessToken,
                        apiKey: input.settings.twitterApiKey,
                        apiSecret: input.settings.twitterApiSecret,
                        nonce: nonce(),
                        timestamp: Math.floor(now() / 1_000),
                    }),
                catch: () => error(provider, 'oauth_signing_failed', false),
            });
            const response = yield* Effect.tryPromise({
                try: () =>
                    fetchWithTimeout(
                        fetchImplementation,
                        'https://api.twitter.com/2/tweets',
                        {
                            body: JSON.stringify({
                                text: input.payload.formattedText,
                            }),
                            headers: {
                                Authorization: authorization,
                                'Content-Type': 'application/json',
                            },
                            method: 'POST',
                        },
                    ),
                catch: () =>
                    error(provider, 'transport_ambiguous', false, true),
            });
            if (!response.ok) {
                return yield* error(
                    provider,
                    `http_${response.status}`,
                    response.status === 429,
                    response.status >= 500,
                );
            }
            const body = yield* Effect.promise(() => decodeJson(response));
            const remoteId = stringAt(body, 'data', 'id');
            if (remoteId === null) {
                return yield* error(provider, 'invalid_response', false, true);
            }
            return ProviderReceipt.make({ remoteId });
        },
    );

    const deliverMastodon = Effect.fn('SocialClients.mastodon')(
        function* (input: {
            readonly deliveryId: string;
            readonly payload: SocialPayloadSnapshot;
            readonly settings: Settings;
        }) {
            const provider = 'mastodon' as const;
            let instance: URL;
            try {
                instance = new URL(input.settings.mastodonInstance);
            } catch {
                return yield* error(provider, 'invalid_instance', false);
            }
            if (instance.protocol !== 'https:') {
                return yield* error(provider, 'invalid_instance', false);
            }
            const endpoint = new URL('/api/v1/statuses', instance);
            const response = yield* Effect.tryPromise({
                try: () =>
                    fetchWithTimeout(fetchImplementation, endpoint, {
                        body: JSON.stringify({
                            status: input.payload.formattedText,
                        }),
                        headers: {
                            Authorization: `Bearer ${input.settings.mastodonAccessToken}`,
                            'Content-Type': 'application/json',
                            'Idempotency-Key': input.deliveryId,
                        },
                        method: 'POST',
                    }),
                catch: () => error(provider, 'transport_failed', true),
            });
            if (!response.ok) {
                return yield* error(
                    provider,
                    `http_${response.status}`,
                    response.status === 429 || response.status >= 500,
                );
            }
            const body = yield* Effect.promise(() => decodeJson(response));
            const remoteId = stringAt(body, 'id');
            if (remoteId === null) {
                return yield* error(provider, 'invalid_response', false);
            }
            return ProviderReceipt.make({ remoteId });
        },
    );

    const deliverBluesky = Effect.fn('SocialClients.bluesky')(
        function* (input: {
            readonly payload: SocialPayloadSnapshot;
            readonly settings: Settings;
            readonly thumbnail: {
                readonly bytes: Uint8Array;
                readonly contentType: string;
            } | null;
        }) {
            const provider = 'bluesky' as const;
            const request = (path: string, init: RequestInit) =>
                Effect.tryPromise({
                    try: () =>
                        fetchWithTimeout(
                            fetchImplementation,
                            `https://bsky.social/xrpc/${path}`,
                            init,
                        ),
                    catch: () => error(provider, 'transport_failed', true),
                });
            const sessionResponse = yield* request(
                'com.atproto.server.createSession',
                {
                    body: JSON.stringify({
                        identifier: input.settings.blueskyHandle,
                        password: input.settings.blueskyAppPassword,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                },
            );
            if (!sessionResponse.ok) {
                return yield* error(
                    provider,
                    `session_http_${sessionResponse.status}`,
                    sessionResponse.status === 429 ||
                        sessionResponse.status >= 500,
                );
            }
            const session = yield* Effect.promise(() =>
                decodeJson(sessionResponse),
            );
            const accessJwt = stringAt(session, 'accessJwt');
            const did = stringAt(session, 'did');
            if (accessJwt === null || did === null) {
                return yield* error(provider, 'invalid_session', false);
            }

            let thumb: unknown = null;
            if (input.thumbnail !== null) {
                const uploadResponse = yield* request(
                    'com.atproto.repo.uploadBlob',
                    {
                        body: input.thumbnail.bytes.slice()
                            .buffer as ArrayBuffer,
                        headers: {
                            Authorization: `Bearer ${accessJwt}`,
                            'Content-Type': input.thumbnail.contentType,
                        },
                        method: 'POST',
                    },
                );
                if (!uploadResponse.ok) {
                    return yield* error(
                        provider,
                        `upload_http_${uploadResponse.status}`,
                        uploadResponse.status === 429 ||
                            uploadResponse.status >= 500,
                    );
                }
                const upload = yield* Effect.promise(() =>
                    decodeJson(uploadResponse),
                );
                if (
                    typeof upload !== 'object' ||
                    upload === null ||
                    !('blob' in upload)
                ) {
                    return yield* error(provider, 'invalid_blob', false);
                }
                thumb = (upload as Record<string, unknown>).blob;
            }

            const rkey = `gongyu-${input.payload.shortUrl}-v1`;
            const external: Record<string, unknown> = {
                description: input.payload.description,
                title: input.payload.title,
                uri: input.payload.originalUrl,
            };
            if (thumb !== null) {
                external.thumb = thumb;
            }
            const createResponse = yield* request(
                'com.atproto.repo.createRecord',
                {
                    body: JSON.stringify({
                        collection: 'app.bsky.feed.post',
                        record: {
                            $type: 'app.bsky.feed.post',
                            createdAt: input.payload.blueskyCreatedAt,
                            embed: {
                                $type: 'app.bsky.embed.external',
                                external,
                            },
                            facets: [
                                {
                                    features: [
                                        {
                                            $type: 'app.bsky.richtext.facet#link',
                                            uri: input.payload.originalUrl,
                                        },
                                    ],
                                    index: {
                                        byteEnd: input.payload.blueskyByteEnd,
                                        byteStart:
                                            input.payload.blueskyByteStart,
                                    },
                                },
                            ],
                            text: input.payload.formattedText,
                        },
                        repo: did,
                        rkey,
                    }),
                    headers: {
                        Authorization: `Bearer ${accessJwt}`,
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                },
            );
            if (!createResponse.ok) {
                if ([400, 409].includes(createResponse.status)) {
                    const query = new URLSearchParams({
                        collection: 'app.bsky.feed.post',
                        repo: did,
                        rkey,
                    });
                    const existingResponse = yield* request(
                        `com.atproto.repo.getRecord?${query.toString()}`,
                        {
                            headers: {
                                Authorization: `Bearer ${accessJwt}`,
                            },
                            method: 'GET',
                        },
                    );
                    if (existingResponse.ok) {
                        const existing = yield* Effect.promise(() =>
                            decodeJson(existingResponse),
                        );
                        const value =
                            typeof existing === 'object' &&
                            existing !== null &&
                            'value' in existing &&
                            typeof existing.value === 'object' &&
                            existing.value !== null
                                ? (existing.value as Record<string, unknown>)
                                : null;
                        const embed =
                            value !== null &&
                            typeof value.embed === 'object' &&
                            value.embed !== null
                                ? (value.embed as Record<string, unknown>)
                                : null;
                        const existingExternal =
                            embed !== null &&
                            typeof embed.external === 'object' &&
                            embed.external !== null
                                ? (embed.external as Record<string, unknown>)
                                : null;
                        if (
                            value?.text === input.payload.formattedText &&
                            existingExternal?.uri === input.payload.originalUrl
                        ) {
                            return ProviderReceipt.make({
                                remoteId: `at://${did}/app.bsky.feed.post/${rkey}`,
                            });
                        }
                        return yield* error(
                            provider,
                            'record_collision',
                            false,
                        );
                    }
                }
                return yield* error(
                    provider,
                    `create_http_${createResponse.status}`,
                    createResponse.status === 429 ||
                        createResponse.status >= 500,
                );
            }
            const body = yield* Effect.promise(() =>
                decodeJson(createResponse),
            );
            const remoteId = stringAt(body, 'uri');
            if (remoteId === null) {
                return yield* error(provider, 'invalid_response', false);
            }
            return ProviderReceipt.make({ remoteId });
        },
    );

    const deliver = Effect.fn('SocialClients.deliver')(function* (input: {
        readonly deliveryId: string;
        readonly payload: SocialPayloadSnapshot;
        readonly provider: SocialProvider;
        readonly settings: Settings;
        readonly thumbnail: {
            readonly bytes: Uint8Array;
            readonly contentType: string;
        } | null;
    }) {
        if (input.provider === 'twitter') {
            return yield* deliverTwitter(input);
        }
        if (input.provider === 'mastodon') {
            return yield* deliverMastodon(input);
        }
        return yield* deliverBluesky(input);
    });

    return { deliver };
}
