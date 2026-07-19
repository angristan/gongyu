import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { recoverAdministrator } from '@gongyu/auth/service';
import { NewSession } from '@gongyu/auth/session-service';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import { Effect, Layer, Schema } from 'effect';
import {
    bootstrapTokenMatches,
    safeReturnTo,
} from '../app/auth/bootstrap.server';
import {
    appendClearedSessionCookies,
    appendSessionCookies,
    requestSessionConstraint,
} from '../app/auth/session.server';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);

class RecoveryCounts extends Schema.Class<RecoveryCounts>('RecoveryCounts')({
    audits: Schema.Number,
    passkeys: Schema.Number,
    sessions: Schema.Number,
}) {}

it.effect('compares bootstrap tokens and validates local return targets', () =>
    Effect.gen(function* () {
        assert.isTrue(
            yield* Effect.promise(() =>
                bootstrapTokenMatches('correct-token', 'correct-token'),
            ),
        );
        assert.isFalse(
            yield* Effect.promise(() =>
                bootstrapTokenMatches('wrong-token', 'correct-token'),
            ),
        );
        assert.strictEqual(
            safeReturnTo('/bookmarklet?url=https%3A%2F%2Fexample.com'),
            '/bookmarklet?url=https%3A%2F%2Fexample.com',
        );
        assert.strictEqual(
            safeReturnTo('https://attacker.test/steal'),
            '/admin/bookmarks',
        );
        assert.strictEqual(safeReturnTo('//attacker.test'), '/admin/bookmarks');
    }),
);

it.effect('emits host-only secure session cookies and clears both values', () =>
    Effect.sync(() => {
        const headers = new Headers();
        appendSessionCookies(
            headers,
            NewSession.make({
                absoluteExpiresAt: 31_000,
                csrfToken: 'csrf',
                idleExpiresAt: 8_000,
                token: 'session',
            }),
            1_000,
        );
        const cookies = headers.getSetCookie();
        assert.strictEqual(cookies.length, 2);
        assert.include(cookies[0] ?? '', '__Host-gongyu-session=session');
        assert.include(cookies[0] ?? '', 'Secure');
        assert.include(cookies[0] ?? '', 'HttpOnly');
        assert.include(cookies[0] ?? '', 'SameSite=Lax');
        assert.include(cookies[1] ?? '', '__Host-gongyu-csrf=csrf');
        assert.notInclude(cookies[1] ?? '', 'HttpOnly');

        const cleared = new Headers();
        appendClearedSessionCookies(cleared);
        assert.isTrue(
            cleared
                .getSetCookie()
                .every((cookie) => cookie.includes('Max-Age=0')),
        );
    }),
);

it.effect('selects replicas only for anonymous safe reads', () =>
    Effect.sync(() => {
        assert.strictEqual(
            requestSessionConstraint(new Request('https://gongyu.test/')),
            'first-unconstrained',
        );
        assert.strictEqual(
            requestSessionConstraint(
                new Request('https://gongyu.test/', {
                    headers: { Cookie: '__Host-gongyu-session=value' },
                }),
            ),
            'first-primary',
        );
        assert.strictEqual(
            requestSessionConstraint(
                new Request('https://gongyu.test/', { method: 'POST' }),
            ),
            'first-primary',
        );
    }),
);

it.layer(D1StoreTest)('operator recovery', (it) => {
    it.effect(
        'atomically clears credentials and sessions and emits an audit row',
        () =>
            Effect.gen(function* () {
                const d1Store = yield* D1Store;
                yield* d1Store.run(
                    `
                    INSERT INTO passkeys (
                        singleton_id,
                        user_id,
                        credential_id,
                        public_key,
                        counter,
                        transports_json,
                        credential_device_type,
                        credential_backed_up,
                        created_at
                    )
                    VALUES (1, 'operator', 'credential', ?, 0, '[]', 'singleDevice', 0, 1)
                `,
                    [new Uint8Array([1, 2, 3])],
                );
                yield* d1Store.run(
                    `
                    INSERT INTO sessions (
                        token_hash,
                        csrf_token_hash,
                        created_at,
                        last_seen_at,
                        idle_expires_at,
                        absolute_expires_at
                    )
                    VALUES ('session', 'csrf', 1, 1, 2, 3)
                `,
                );

                yield* recoverAdministrator({ now: 10, requestId: 'recovery' });
                const counts = yield* d1Store.first(
                    RecoveryCounts,
                    `
                    SELECT
                        (SELECT COUNT(*) FROM passkeys) AS passkeys,
                        (SELECT COUNT(*) FROM sessions) AS sessions,
                        (SELECT COUNT(*) FROM audit_log
                            WHERE event = 'administrator_recovered') AS audits
                `,
                );
                assert.strictEqual(counts?.audits, 1);
                assert.strictEqual(counts?.passkeys, 0);
                assert.strictEqual(counts?.sessions, 0);
            }),
    );
});
