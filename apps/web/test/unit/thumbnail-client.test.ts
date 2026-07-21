import { assert, it } from '@effect/vitest';
import type { MetadataFetch } from '@gongyu/integrations/metadata-client';
import {
    makeThumbnailClient,
    ThumbnailError,
    type ThumbnailImagesBinding,
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

function webp(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(30);
    bytes.set([82, 73, 70, 70], 0);
    bytes.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
    const normalizedWidth = width - 1;
    const normalizedHeight = height - 1;
    bytes.set(
        [
            normalizedWidth & 0xff,
            (normalizedWidth >> 8) & 0xff,
            (normalizedWidth >> 16) & 0xff,
        ],
        24,
    );
    bytes.set(
        [
            normalizedHeight & 0xff,
            (normalizedHeight >> 8) & 0xff,
            (normalizedHeight >> 16) & 0xff,
        ],
        27,
    );
    return bytes;
}

function normalizedImages(options?: {
    readonly fail?: boolean;
    readonly output?: Uint8Array;
    readonly outputOptions?: unknown[];
    readonly transforms?: unknown[];
}): ThumbnailImagesBinding {
    return {
        input() {
            return {
                transform(transformOptions) {
                    options?.transforms?.push(transformOptions);
                    return this;
                },
                async output(outputOptions) {
                    options?.outputOptions?.push(outputOptions);
                    if (options?.fail === true) {
                        throw new Error('Image transformation failed.');
                    }
                    const bytes = options?.output ?? webp(640, 480);
                    return {
                        response: () =>
                            new Response(bytes.slice().buffer as ArrayBuffer, {
                                headers: {
                                    'Content-Type': 'image/webp',
                                },
                            }),
                    };
                },
            };
        },
    };
}

const unusedImages: ThumbnailImagesBinding = {
    input() {
        throw new Error('Image transformation must not run.');
    },
};

it.effect('accepts bounded matching PNG bytes after HTTPS redirects', () =>
    Effect.gen(function* () {
        const outputOptions: unknown[] = [];
        const requests: string[] = [];
        const transforms: unknown[] = [];
        const fetchImplementation: MetadataFetch = async (input) => {
            const url = input.toString();
            requests.push(url);
            if (url.endsWith('/start')) {
                return new Response(null, {
                    headers: { Location: '/image.png' },
                    status: 302,
                });
            }
            return new Response(png(1_200, 900).slice().buffer as ArrayBuffer, {
                headers: { 'Content-Type': 'image/png' },
            });
        };
        const thumbnail = yield* makeThumbnailClient(
            normalizedImages({ outputOptions, transforms }),
            fetchImplementation,
        ).fetch('https://example.com/start');
        assert.strictEqual(thumbnail.width, 640);
        assert.strictEqual(thumbnail.height, 480);
        assert.strictEqual(thumbnail.contentType, 'image/webp');
        assert.strictEqual(thumbnail.extension, 'webp');
        assert.strictEqual(
            thumbnail.sourceUrl,
            'https://example.com/image.png',
        );
        assert.lengthOf(thumbnail.sha256, 64);
        assert.deepEqual(requests, [
            'https://example.com/start',
            'https://example.com/image.png',
        ]);
        assert.deepEqual(transforms, [
            { fit: 'scale-down', height: 640, width: 640 },
        ]);
        assert.deepEqual(outputOptions, [
            { anim: false, format: 'image/webp', quality: 78 },
        ]);
    }),
);

it.effect('rejects MIME mismatches and excessive dimensions', () =>
    Effect.gen(function* () {
        const mismatch = makeThumbnailClient(
            unusedImages,
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
            unusedImages,
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

it.effect('reports image transformation failures', () =>
    Effect.gen(function* () {
        const client = makeThumbnailClient(
            normalizedImages({ fail: true }),
            async () =>
                new Response(png(1_200, 900).slice().buffer as ArrayBuffer, {
                    headers: { 'Content-Type': 'image/png' },
                }),
        );
        const error = yield* client
            .fetch('https://example.com/image.png')
            .pipe(Effect.flip);

        assert.instanceOf(error, ThumbnailError);
        if (error instanceof ThumbnailError) {
            assert.strictEqual(error.code, 'image_transform_failed');
            assert.isTrue(error.retryable);
        }
    }),
);

it.effect('rejects insecure image redirects and declared overflow', () =>
    Effect.gen(function* () {
        const insecure = makeThumbnailClient(
            unusedImages,
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
            unusedImages,
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
