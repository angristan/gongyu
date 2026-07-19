import { assert, it } from '@effect/vitest';
import type { MetadataFetch } from '@gongyu/integrations/metadata-client';
import {
    makeThumbnailClient,
    ThumbnailError,
} from '@gongyu/integrations/thumbnail-client';
import { Effect } from 'effect';

function png(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

it.effect('accepts bounded matching PNG bytes after HTTPS redirects', () =>
    Effect.gen(function* () {
        const requests: string[] = [];
        const fetchImplementation: MetadataFetch = async (input) => {
            const url = input.toString();
            requests.push(url);
            if (url.endsWith('/start')) {
                return new Response(null, {
                    headers: { Location: '/image.png' },
                    status: 302,
                });
            }
            return new Response(png(640, 480).slice().buffer as ArrayBuffer, {
                headers: { 'Content-Type': 'image/png' },
            });
        };
        const thumbnail = yield* makeThumbnailClient(fetchImplementation).fetch(
            'https://example.com/start',
        );
        assert.strictEqual(thumbnail.width, 640);
        assert.strictEqual(thumbnail.height, 480);
        assert.strictEqual(thumbnail.contentType, 'image/png');
        assert.strictEqual(thumbnail.extension, 'png');
        assert.strictEqual(
            thumbnail.sourceUrl,
            'https://example.com/image.png',
        );
        assert.lengthOf(thumbnail.sha256, 64);
        assert.deepEqual(requests, [
            'https://example.com/start',
            'https://example.com/image.png',
        ]);
    }),
);

it.effect('rejects MIME mismatches and excessive dimensions', () =>
    Effect.gen(function* () {
        const mismatch = makeThumbnailClient(
            async () =>
                new Response(png(100, 100).slice().buffer as ArrayBuffer, {
                    headers: { 'Content-Type': 'image/jpeg' },
                }),
        );
        const mismatchError = yield* mismatch
            .fetch('https://example.com/image')
            .pipe(Effect.flip);
        assert.instanceOf(mismatchError, ThumbnailError);
        if (mismatchError instanceof ThumbnailError) {
            assert.strictEqual(mismatchError.code, 'invalid_image');
        }

        const dimensions = makeThumbnailClient(
            async () =>
                new Response(png(4_097, 100).slice().buffer as ArrayBuffer, {
                    headers: { 'Content-Type': 'image/png' },
                }),
        );
        const dimensionError = yield* dimensions
            .fetch('https://example.com/image')
            .pipe(Effect.flip);
        assert.instanceOf(dimensionError, ThumbnailError);
        if (dimensionError instanceof ThumbnailError) {
            assert.strictEqual(
                dimensionError.code,
                'image_dimensions_exceeded',
            );
        }
    }),
);

it.effect('rejects insecure image redirects and declared overflow', () =>
    Effect.gen(function* () {
        const insecure = makeThumbnailClient(
            async () =>
                new Response(null, {
                    headers: { Location: 'http://example.com/image.png' },
                    status: 302,
                }),
        );
        const insecureError = yield* insecure
            .fetch('https://example.com/start')
            .pipe(Effect.flip);
        assert.instanceOf(insecureError, ThumbnailError);
        if (insecureError instanceof ThumbnailError) {
            assert.strictEqual(insecureError.code, 'unsafe_image_url');
        }

        const oversized = makeThumbnailClient(
            async () =>
                new Response(png(100, 100).slice().buffer as ArrayBuffer, {
                    headers: {
                        'Content-Length': '1000001',
                        'Content-Type': 'image/png',
                    },
                }),
        );
        const sizeError = yield* oversized
            .fetch('https://example.com/image.png')
            .pipe(Effect.flip);
        assert.instanceOf(sizeError, ThumbnailError);
        if (sizeError instanceof ThumbnailError) {
            assert.strictEqual(sizeError.code, 'image_too_large');
        }
    }),
);
