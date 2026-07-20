import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    makeSessionService,
    SESSION_ABSOLUTE_TTL_MS,
    SESSION_IDLE_TTL_MS,
    SessionService,
} from '@gongyu/auth/session-service';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const SessionServiceTest = Layer.effect(SessionService)(
    Effect.gen(function* () {
        const d1Store = yield* D1Store;
        return makeSessionService(d1Store);
    }),
);
const TestLayer = Layer.provideMerge(SessionServiceTest, D1StoreTest);

class CountRow extends Schema.Class<CountRow>('SessionCountRow')({
    count: Schema.Number,
}) {}

it.layer(TestLayer)('administrator sessions', (it) => {
    it.effect('stores only hashes and validates the CSRF synchronizer', () =>
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            const d1Store = yield* D1Store;
            const created = yield* sessions.create(1_000);
            const rawMatches = yield* d1Store.first(
                CountRow,
                `
                    SELECT COUNT(*) AS count
                    FROM sessions
                    WHERE token_hash = ? OR csrf_token_hash = ?
                `,
                [created.token, created.csrfToken],
            );
            assert.strictEqual(rawMatches?.count, 0);

            const authenticated = yield* sessions.authenticate(
                created.token,
                2_000,
            );
            assert.isNotNull(authenticated);
            if (authenticated !== null) {
                assert.isTrue(
                    yield* sessions.verifyCsrf(
                        authenticated,
                        created.csrfToken,
                    ),
                );
                assert.isFalse(
                    yield* sessions.verifyCsrf(authenticated, 'incorrect'),
                );
            }
        }),
    );

    it.effect('enforces sliding idle and fixed absolute expiry', () =>
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            const idle = yield* sessions.create(10_000);
            assert.isNotNull(
                yield* sessions.authenticate(
                    idle.token,
                    10_000 + SESSION_IDLE_TTL_MS - 1,
                ),
            );

            const expiredIdle = yield* sessions.create(20_000);
            assert.isNull(
                yield* sessions.authenticate(
                    expiredIdle.token,
                    20_000 + SESSION_IDLE_TTL_MS,
                ),
            );

            const absolute = yield* sessions.create(30_000);
            assert.isNotNull(
                yield* sessions.authenticate(
                    absolute.token,
                    30_000 + SESSION_IDLE_TTL_MS - 1,
                ),
            );
            assert.isNull(
                yield* sessions.authenticate(
                    absolute.token,
                    30_000 + SESSION_ABSOLUTE_TTL_MS,
                ),
            );
        }),
    );

    it.effect('invalidates individual and all active sessions', () =>
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            const first = yield* sessions.create(100);
            const second = yield* sessions.create(200);
            yield* sessions.invalidate(first.token);
            assert.isNull(yield* sessions.authenticate(first.token, 300));
            const authenticated = yield* sessions.authenticate(
                second.token,
                300,
            );
            assert.isNotNull(authenticated);
            yield* sessions.invalidateAll;
            assert.isNull(yield* sessions.authenticate(second.token, 400));
            if (authenticated !== null) {
                assert.isFalse(
                    yield* sessions.verifyCsrf(authenticated, second.csrfToken),
                );
            }
        }),
    );
});
