import { Context, Effect, Schema } from 'effect';

export class R2StoreError extends Schema.TaggedErrorClass<R2StoreError>()(
    'R2StoreError',
    {
        cause: Schema.optionalKey(Schema.Unknown),
        key: Schema.String,
        message: Schema.String,
        operation: Schema.String,
    },
) {}

export interface R2ObjectMetadata {
    readonly contentType: string;
    readonly etag: string;
    readonly key: string;
    readonly size: number;
}

export interface R2StoredObject extends R2ObjectMetadata {
    readonly body: ReadableStream<Uint8Array>;
}

export interface R2StoreShape {
    readonly delete: (key: string) => Effect.Effect<void, R2StoreError>;
    readonly get: (
        key: string,
    ) => Effect.Effect<R2StoredObject | null, R2StoreError>;
    readonly head: (
        key: string,
    ) => Effect.Effect<R2ObjectMetadata | null, R2StoreError>;
    readonly putStream: (input: {
        readonly body: ReadableStream<Uint8Array>;
        readonly contentLength: number;
        readonly contentType: string;
        readonly key: string;
    }) => Effect.Effect<R2ObjectMetadata, R2StoreError>;
}

export class R2Store extends Context.Service<R2Store, R2StoreShape>()(
    '@gongyu/runtime/R2Store',
) {}

function annotateR2Span(key: string, operation: string) {
    return Effect.annotateCurrentSpan({
        'r2.key': key,
        'r2.operation': operation,
    });
}

export function makeR2Store(bucket: R2Bucket): R2StoreShape {
    const deleteObject = Effect.fn('R2Store.delete')(function* (key: string) {
        yield* annotateR2Span(key, 'delete');
        yield* Effect.tryPromise({
            try: () => bucket.delete(key),
            catch: (cause) =>
                R2StoreError.make({
                    cause,
                    key,
                    message: 'R2 object could not be deleted.',
                    operation: 'delete',
                }),
        });
    });

    const get = Effect.fn('R2Store.get')(function* (key: string) {
        yield* annotateR2Span(key, 'get');
        const object = yield* Effect.tryPromise({
            try: () => bucket.get(key),
            catch: (cause) =>
                R2StoreError.make({
                    cause,
                    key,
                    message: 'R2 object could not be read.',
                    operation: 'get',
                }),
        });
        if (object === null) {
            return null;
        }
        return {
            body: object.body,
            contentType:
                object.httpMetadata?.contentType ?? 'application/octet-stream',
            etag: object.httpEtag,
            key: object.key,
            size: object.size,
        };
    });

    const head = Effect.fn('R2Store.head')(function* (key: string) {
        yield* annotateR2Span(key, 'head');
        const object = yield* Effect.tryPromise({
            try: () => bucket.head(key),
            catch: (cause) =>
                R2StoreError.make({
                    cause,
                    key,
                    message: 'R2 object metadata could not be read.',
                    operation: 'head',
                }),
        });

        if (object === null) {
            return null;
        }

        return {
            contentType:
                object.httpMetadata?.contentType ?? 'application/octet-stream',
            etag: object.httpEtag,
            key: object.key,
            size: object.size,
        };
    });

    const putStream = Effect.fn('R2Store.putStream')(function* (input: {
        readonly body: ReadableStream<Uint8Array>;
        readonly contentLength: number;
        readonly contentType: string;
        readonly key: string;
    }) {
        yield* annotateR2Span(input.key, 'put');
        const object = yield* Effect.tryPromise({
            try: async () => {
                const fixedLength = new FixedLengthStream(input.contentLength);
                const upload = bucket.put(input.key, fixedLength.readable, {
                    httpMetadata: { contentType: input.contentType },
                    onlyIf: { etagDoesNotMatch: '*' },
                });
                const pump = input.body.pipeTo(fixedLength.writable);
                const [uploaded] = await Promise.all([upload, pump]);
                return uploaded;
            },
            catch: (cause) =>
                R2StoreError.make({
                    cause,
                    key: input.key,
                    message: 'R2 stream upload failed.',
                    operation: 'put',
                }),
        });

        if (object === null) {
            return yield* Effect.fail(
                R2StoreError.make({
                    key: input.key,
                    message: 'The immutable R2 object key already exists.',
                    operation: 'put',
                }),
            );
        }

        return {
            contentType: object.httpMetadata?.contentType ?? input.contentType,
            etag: object.httpEtag,
            key: object.key,
            size: object.size,
        };
    });

    return { delete: deleteObject, get, head, putStream };
}
