import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { D1DecodeError, D1Store, makeD1Store } from '../app/effect/d1-store';
import {
    claimJob,
    completeJob,
    createBookmarkAndJob,
    findBookmarkByShortUrl,
    searchBookmarks,
} from '../app/effect/phase0-repository';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);

class HealthRow extends Schema.Class<HealthRow>('HealthRow')({
    ok: Schema.Number,
}) {}

it.layer(D1StoreTest)('native D1 query adapter', (it) => {
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

it.layer(D1StoreTest)('atomic D1 batches', (it) => {
    it.effect('rolls every statement back when one fails', () =>
        Effect.gen(function* () {
            yield* createBookmarkAndJob({
                createdAt: 1,
                jobId: 'job-existing',
                shortUrl: 'existing',
                title: 'Existing bookmark',
            });

            yield* createBookmarkAndJob({
                createdAt: 2,
                jobId: 'job-existing',
                shortUrl: 'must-roll-back',
                title: 'Rolled back bookmark',
            }).pipe(Effect.flip);

            const existing = yield* findBookmarkByShortUrl('existing');
            const rolledBack = yield* findBookmarkByShortUrl('must-roll-back');
            assert.strictEqual(existing?.title, 'Existing bookmark');
            assert.isNull(rolledBack);
        }),
    );
});

it.layer(D1StoreTest)('D1 FTS5', (it) => {
    it.effect('keeps inserts searchable through triggers', () =>
        Effect.gen(function* () {
            yield* createBookmarkAndJob({
                createdAt: 1,
                jobId: 'job-searchable',
                shortUrl: 'searchable',
                title: 'Cloudflare runtime architecture',
            });

            const results = yield* searchBookmarks('Cloudflare');
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0]?.shortUrl, 'searchable');
        }),
    );
});

it.layer(D1StoreTest)('outbox leases', (it) => {
    it.effect('prevents concurrent claims and reclaims expired work', () =>
        Effect.gen(function* () {
            yield* createBookmarkAndJob({
                createdAt: 1,
                jobId: 'job-lease',
                shortUrl: 'lease',
                title: 'Lease behavior',
            });

            const first = yield* claimJob({
                jobId: 'job-lease',
                leaseDurationMs: 1_000,
                leaseToken: 'lease-one',
                now: 100,
            });
            const concurrent = yield* claimJob({
                jobId: 'job-lease',
                leaseDurationMs: 1_000,
                leaseToken: 'lease-two',
                now: 101,
            });
            const reclaimed = yield* claimJob({
                jobId: 'job-lease',
                leaseDurationMs: 1_000,
                leaseToken: 'lease-two',
                now: 1_101,
            });

            assert.strictEqual(first?.attempts, 1);
            assert.isNull(concurrent);
            assert.strictEqual(reclaimed?.attempts, 2);
            assert.isFalse(
                yield* completeJob({
                    completedAt: 1_102,
                    jobId: 'job-lease',
                    leaseToken: 'lease-one',
                }),
            );
            assert.isTrue(
                yield* completeJob({
                    completedAt: 1_103,
                    jobId: 'job-lease',
                    leaseToken: 'lease-two',
                }),
            );
        }),
    );
});
