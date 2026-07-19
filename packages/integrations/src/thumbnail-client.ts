import { Context, Effect, Schema } from 'effect';
import type { MetadataFetch } from './metadata-client';

const IMAGE_LIMIT_BYTES = 1_000_000;
const IMAGE_TIMEOUT_MS = 10_000;
const REDIRECT_LIMIT = 5;
const MAX_DIMENSION = 4_096;
const MAX_PIXELS = 16_777_216;

export class ThumbnailError extends Schema.TaggedErrorClass<ThumbnailError>()(
    'ThumbnailError',
    {
        code: Schema.String,
        message: Schema.String,
        retryable: Schema.Boolean,
    },
) {}

export class ValidatedThumbnail extends Schema.Class<ValidatedThumbnail>(
    'ValidatedThumbnail',
)({
    bytes: Schema.Uint8Array,
    contentType: Schema.String,
    extension: Schema.String,
    height: Schema.Number,
    sha256: Schema.String,
    sourceUrl: Schema.String,
    width: Schema.Number,
}) {}

export interface ThumbnailClientShape {
    readonly fetch: (
        url: string,
    ) => Effect.Effect<ValidatedThumbnail, ThumbnailError>;
}

export class ThumbnailClient extends Context.Service<
    ThumbnailClient,
    ThumbnailClientShape
>()('@gongyu/integrations/ThumbnailClient') {}

function failure(
    code: string,
    message: string,
    retryable: boolean,
): ThumbnailError {
    return ThumbnailError.make({ code, message, retryable });
}

function parseHttpsUrl(value: string): URL | ThumbnailError {
    if (value.length > 2_048) {
        return failure(
            'image_url_too_long',
            'Thumbnail URL is too long.',
            false,
        );
    }
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'https:' ||
            url.username !== '' ||
            url.password !== ''
        ) {
            return failure(
                'unsafe_image_url',
                'Thumbnail URLs must use HTTPS without credentials.',
                false,
            );
        }
        return url;
    } catch {
        return failure('invalid_image_url', 'Invalid thumbnail URL.', false);
    }
}

function pngDimensions(bytes: Uint8Array): [number, number] | null {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
        bytes.length < 24 ||
        !signature.every((value, index) => bytes[index] === value) ||
        String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    ) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
}

function jpegDimensions(bytes: Uint8Array): [number, number] | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return null;
    }
    const sofMarkers = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
    ]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1];
        if (sofMarkers.has(marker)) {
            return [
                (bytes[offset + 7] << 8) | bytes[offset + 8],
                (bytes[offset + 5] << 8) | bytes[offset + 6],
            ];
        }
        if (marker === 0xd8 || marker === 0xd9) {
            offset += 2;
            continue;
        }
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (length < 2) {
            return null;
        }
        offset += length + 2;
    }
    return null;
}

function webpDimensions(bytes: Uint8Array): [number, number] | null {
    const text = (start: number, end: number) =>
        String.fromCharCode(...bytes.slice(start, end));
    if (bytes.length < 30 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP') {
        return null;
    }
    const chunk = text(12, 16);
    if (chunk === 'VP8X') {
        const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        return [width, height];
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
        return [
            1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
            1 +
                ((bytes[22] & 0xc0) >> 6) +
                (bytes[23] << 2) +
                ((bytes[24] & 0x0f) << 10),
        ];
    }
    if (
        chunk === 'VP8 ' &&
        bytes[23] === 0x9d &&
        bytes[24] === 0x01 &&
        bytes[25] === 0x2a
    ) {
        return [
            (bytes[26] | (bytes[27] << 8)) & 0x3fff,
            (bytes[28] | (bytes[29] << 8)) & 0x3fff,
        ];
    }
    return null;
}

function validateImage(
    bytes: Uint8Array,
    contentType: string,
): { extension: string; height: number; width: number } | ThumbnailError {
    const parsers = {
        'image/jpeg': { extension: 'jpg', parse: jpegDimensions },
        'image/png': { extension: 'png', parse: pngDimensions },
        'image/webp': { extension: 'webp', parse: webpDimensions },
    } as const;
    const parser = parsers[contentType as keyof typeof parsers];
    if (parser === undefined) {
        return failure(
            'unsupported_image_type',
            'Only JPEG, PNG, and WebP thumbnails are supported.',
            false,
        );
    }
    const dimensions = parser.parse(bytes);
    if (dimensions === null) {
        return failure(
            'invalid_image',
            'Thumbnail bytes do not match their declared image type.',
            false,
        );
    }
    const [width, height] = dimensions;
    if (
        width < 1 ||
        height < 1 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION ||
        width * height > MAX_PIXELS
    ) {
        return failure(
            'image_dimensions_exceeded',
            'Thumbnail dimensions exceed the allowed bounds.',
            false,
        );
    }
    return { extension: parser.extension, height, width };
}

const readBytes = Effect.fn('ThumbnailClient.readBytes')(function* (
    response: Response,
    deadline: number,
) {
    const declared = Number.parseInt(
        response.headers.get('Content-Length') ?? '0',
        10,
    );
    if (declared > IMAGE_LIMIT_BYTES) {
        return yield* failure(
            'image_too_large',
            'Thumbnail exceeds one megabyte.',
            false,
        );
    }
    if (response.body === null) {
        return yield* failure('empty_image', 'Thumbnail is empty.', false);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    throw new Error('Thumbnail body timed out.');
                }
                let timeout: ReturnType<typeof setTimeout> | undefined;
                try {
                    return await Promise.race([
                        reader.read(),
                        new Promise<never>((_, reject) => {
                            timeout = setTimeout(() => {
                                void reader.cancel();
                                reject(new Error('Thumbnail body timed out.'));
                            }, remaining);
                        }),
                    ]);
                } finally {
                    if (timeout !== undefined) {
                        clearTimeout(timeout);
                    }
                }
            },
            catch: () =>
                failure(
                    'image_read_failed',
                    'Thumbnail could not be read.',
                    true,
                ),
        });
        if (result.done) {
            break;
        }
        size += result.value.byteLength;
        if (size > IMAGE_LIMIT_BYTES) {
            yield* Effect.promise(() => reader.cancel());
            return yield* failure(
                'image_too_large',
                'Thumbnail exceeds one megabyte.',
                false,
            );
        }
        chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
});

export function makeThumbnailClient(
    fetchImplementation: MetadataFetch = fetch,
): ThumbnailClientShape {
    const fetchThumbnail = Effect.fn('ThumbnailClient.fetch')(function* (
        value: string,
    ) {
        const initial = parseHttpsUrl(value);
        if (initial instanceof ThumbnailError) {
            return yield* initial;
        }
        let current = initial;
        const deadline = Date.now() + IMAGE_TIMEOUT_MS;
        for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects += 1) {
            const response = yield* Effect.tryPromise({
                try: async (signal) => {
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) {
                        throw new Error('Thumbnail fetch timed out.');
                    }
                    const controller = new AbortController();
                    const timeout = setTimeout(
                        () => controller.abort(),
                        Math.min(IMAGE_TIMEOUT_MS, remaining),
                    );
                    const abort = () => controller.abort();
                    signal.addEventListener('abort', abort, { once: true });
                    try {
                        return await fetchImplementation(current, {
                            headers: {
                                Accept: 'image/jpeg,image/png,image/webp',
                                'User-Agent': 'Gongyu thumbnail fetcher',
                            },
                            redirect: 'manual',
                            signal: controller.signal,
                        });
                    } finally {
                        clearTimeout(timeout);
                        signal.removeEventListener('abort', abort);
                    }
                },
                catch: () =>
                    failure(
                        'image_fetch_failed',
                        'Thumbnail could not be fetched.',
                        true,
                    ),
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                if (redirects === REDIRECT_LIMIT) {
                    return yield* failure(
                        'image_redirect_limit',
                        'Thumbnail redirected too many times.',
                        false,
                    );
                }
                const location = response.headers.get('Location');
                if (location === null) {
                    return yield* failure(
                        'invalid_image_redirect',
                        'Thumbnail returned an invalid redirect.',
                        false,
                    );
                }
                const next = yield* Effect.try({
                    try: () => new URL(location, current),
                    catch: () =>
                        failure(
                            'invalid_image_redirect',
                            'Thumbnail returned an invalid redirect.',
                            false,
                        ),
                });
                const validated = parseHttpsUrl(next.href);
                if (validated instanceof ThumbnailError) {
                    return yield* validated;
                }
                current = validated;
                continue;
            }
            if (!response.ok) {
                return yield* failure(
                    'image_upstream_status',
                    'Thumbnail returned an unsuccessful response.',
                    response.status === 429 || response.status >= 500,
                );
            }
            const contentType = (response.headers.get('Content-Type') ?? '')
                .split(';')[0]
                .trim()
                .toLowerCase();
            const bytes = yield* readBytes(response, deadline);
            const dimensions = validateImage(bytes, contentType);
            if (dimensions instanceof ThumbnailError) {
                return yield* dimensions;
            }
            const digest = yield* Effect.promise(() =>
                crypto.subtle.digest('SHA-256', bytes),
            );
            const sha256 = Array.from(new Uint8Array(digest), (byte) =>
                byte.toString(16).padStart(2, '0'),
            ).join('');
            return ValidatedThumbnail.make({
                bytes,
                contentType,
                extension: dimensions.extension,
                height: dimensions.height,
                sha256,
                sourceUrl: current.href,
                width: dimensions.width,
            });
        }
        return yield* failure(
            'image_redirect_limit',
            'Thumbnail redirected too many times.',
            false,
        );
    });
    return { fetch: fetchThumbnail };
}
