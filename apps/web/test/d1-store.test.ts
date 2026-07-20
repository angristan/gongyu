import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { D1DecodeError, D1Store, makeD1Store } from '@gongyu/data/d1-store';
import { Effect, Layer, Schema, Tracer } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);

class HealthRow extends Schema.Class<HealthRow>('HealthRow')({
    ok: Schema.Number,
}) {}

const Byte = Schema.Int.check(Schema.isBetween({ maximum: 255, minimum: 0 }));

class BlobRow extends Schema.Class<BlobRow>('BlobRow')({
    value: Schema.Array(Byte),
}) {}

it.layer(D1StoreTest)('native D1 query adapter', (it) => {
    it.effect('returns stored BLOB values as raw buffers', () =>
        Effect.gen(function* () {
            const d1Store = yield* D1Store;
            const row = yield* d1Store.first(BlobRow, 'SELECT ? AS value', [
                new Uint8Array([1, 2, 3]),
            ]);

            assert.deepEqual(row?.value, [1, 2, 3]);
        }),
    );

    it.effect('decodes rows and preserves session metadata', () =>
        Effect.gen(function* () {
            const d1Store = yield* D1Store;
            const result = yield* d1Store.query(HealthRow, 'SELECT 1 AS ok');

            assert.strictEqual(result.rows.length, 1);
            assert.strictEqual(result.rows[0]?.ok, 1);
            assert.isAtLeast(result.meta.rowsRead, 0);
            assert.isNotNull(yield* d1Store.getBookmark);
        }),
    );

    it.effect('annotates query spans with D1 metadata', () =>
        Effect.gen(function* () {
            const spans: Tracer.NativeSpan[] = [];
            const tracer = Tracer.make({
                span(options) {
                    const span = new Tracer.NativeSpan(options);
                    spans.push(span);
                    return span;
                },
            });
            const d1Store = yield* D1Store;

            yield* d1Store
                .query(HealthRow, 'SELECT 1 AS ok')
                .pipe(Effect.provideService(Tracer.Tracer, tracer));
            yield* Effect.yieldNow;

            const querySpan = spans.find(
                (span) => span.name === 'D1Store.query',
            );
            assert.isDefined(querySpan);
            assert.strictEqual(
                querySpan?.attributes.get('db.system.name'),
                'sqlite',
            );
            assert.strictEqual(
                querySpan?.attributes.get('db.operation.name'),
                'execute',
            );
            assert.isNumber(querySpan?.attributes.get('d1.duration_ms'));
            assert.isNumber(querySpan?.attributes.get('d1.rows_read'));
            assert.isNumber(querySpan?.attributes.get('d1.rows_written'));
        }),
    );

    it.effect('returns a typed decode failure', () =>
        Effect.gen(function* () {
            const d1Store = yield* D1Store;
            const failure = yield* d1Store
                .query(HealthRow, "SELECT 'invalid' AS ok")
                .pipe(Effect.flip);

            assert.instanceOf(failure, D1DecodeError);
        }),
    );
});
