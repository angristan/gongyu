import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { Phase0WorkflowPayload } from '@gongyu/domain/workflows';
import {
    makeR2Store,
    R2Store,
    R2StoreError,
} from '@gongyu/integrations/r2-store';
import { Effect, Layer, Schema } from 'effect';

const R2StoreTest = Layer.succeed(R2Store)(makeR2Store(env.UPLOADS));

function streamChunks(chunks: readonly string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

it.layer(R2StoreTest)('native R2 stream adapter', (it) => {
    it.effect('streams chunks directly and preserves metadata', () =>
        Effect.gen(function* () {
            const r2Store = yield* R2Store;
            const uploaded = yield* r2Store.putStream({
                body: streamChunks(['gong', 'yu']),
                contentLength: 6,
                contentType: 'text/plain',
                key: 'tests/streamed-object',
            });
            const head = yield* r2Store.head(uploaded.key);
            const stored = yield* Effect.promise(() =>
                env.UPLOADS.get(uploaded.key),
            );

            assert.strictEqual(uploaded.size, 6);
            assert.strictEqual(uploaded.contentType, 'text/plain');
            assert.strictEqual(head?.etag, uploaded.etag);
            assert.strictEqual(
                yield* Effect.promise(
                    () => stored?.text() ?? Promise.resolve(''),
                ),
                'gongyu',
            );
        }),
    );

    it.effect('does not overwrite an immutable object key', () =>
        Effect.gen(function* () {
            const r2Store = yield* R2Store;
            yield* r2Store.putStream({
                body: streamChunks(['first']),
                contentLength: 5,
                contentType: 'text/plain',
                key: 'tests/immutable-object',
            });
            const failure = yield* r2Store
                .putStream({
                    body: streamChunks(['second']),
                    contentLength: 6,
                    contentType: 'text/plain',
                    key: 'tests/immutable-object',
                })
                .pipe(Effect.flip);

            assert.instanceOf(failure, R2StoreError);
        }),
    );
});

it.effect('accepts only version 1 Workflow references', () =>
    Effect.gen(function* () {
        const valid = yield* Schema.decodeUnknownEffect(Phase0WorkflowPayload)({
            operation: 'phase0.import',
            source: {
                bucket: 'uploads',
                contentType: 'application/json',
                etag: 'etag',
                key: 'phase0/uploads/reference',
                size: 42,
            },
            version: 1,
        });
        assert.strictEqual(valid.source.key, 'phase0/uploads/reference');

        const failure = yield* Schema.decodeUnknownEffect(
            Phase0WorkflowPayload,
        )({
            operation: 'phase0.import',
            source: {
                bucket: 'uploads',
                contentType: 'application/json',
                etag: 'etag',
                key: 'phase0/uploads/reference',
                size: 42,
            },
            version: 2,
        }).pipe(Effect.flip);
        assert.isDefined(failure);
    }),
);
