import { assert, it } from '@effect/vitest';
import { MetadataError } from '@gongyu/domain/metadata';
import {
    type MetadataFetch,
    makeMetadataClient,
} from '@gongyu/integrations/metadata-client';
import { Effect } from 'effect';

it.effect('extracts bounded candidates and resolves HTTPS images', () =>
    Effect.gen(function* () {
        const requests: URL[] = [];
        const fetchImplementation: MetadataFetch = async (input) => {
            const url = new URL(input.toString());
            requests.push(url);
            if (url.pathname === '/start') {
                return new Response(null, {
                    headers: { Location: '/article' },
                    status: 302,
                });
            }
            return new Response(
                `
                    <html>
                        <head>
                            <title>  Cloudflare   metadata  </title>
                            <meta name="description" content="Bounded description">
                            <meta property="og:image" content="/image.webp">
                        </head>
                    </html>
                `,
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            );
        };
        const client = makeMetadataClient(fetchImplementation);
        const result = yield* client.fetch('https://example.com/start');

        assert.strictEqual(result.title, 'Cloudflare metadata');
        assert.strictEqual(result.description, 'Bounded description');
        assert.strictEqual(result.imageUrl, 'https://example.com/image.webp');
        assert.deepEqual(
            requests.map((url) => url.href),
            ['https://example.com/start', 'https://example.com/article'],
        );
    }),
);

it.effect('rejects credentials HTTP redirects and oversized bodies', () =>
    Effect.gen(function* () {
        let calls = 0;
        const fetchImplementation: MetadataFetch = async () => {
            calls += 1;
            return new Response(null, {
                headers: { Location: 'http://example.com/insecure' },
                status: 302,
            });
        };
        const client = makeMetadataClient(fetchImplementation);
        const credentials = yield* client
            .fetch('https://user:secret@example.com')
            .pipe(Effect.flip);
        assert.instanceOf(credentials, MetadataError);
        assert.strictEqual(calls, 0);

        const redirect = yield* client
            .fetch('https://example.com/start')
            .pipe(Effect.flip);
        assert.instanceOf(redirect, MetadataError);
        if (redirect instanceof MetadataError) {
            assert.strictEqual(redirect.code, 'insecure_redirect');
        }

        const oversized = makeMetadataClient(
            async () =>
                new Response('<html></html>', {
                    headers: {
                        'Content-Length': '1048577',
                        'Content-Type': 'text/html',
                    },
                }),
        );
        const tooLarge = yield* oversized
            .fetch('https://example.com')
            .pipe(Effect.flip);
        assert.instanceOf(tooLarge, MetadataError);
        if (tooLarge instanceof MetadataError) {
            assert.strictEqual(tooLarge.code, 'response_too_large');
        }
    }),
);

it.effect('classifies retryable status failures without reading bodies', () =>
    Effect.gen(function* () {
        const client = makeMetadataClient(
            async () =>
                new Response('unavailable', {
                    headers: { 'Content-Type': 'text/plain' },
                    status: 503,
                }),
        );
        const error = yield* client
            .fetch('https://example.com')
            .pipe(Effect.flip);
        assert.instanceOf(error, MetadataError);
        if (error instanceof MetadataError) {
            assert.strictEqual(error.code, 'upstream_status');
            assert.isTrue(error.retryable);
        }
    }),
);
