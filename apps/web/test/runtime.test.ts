import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { D1Store } from '@gongyu/data/d1-store';
import { JobsInvocationInfo, makeJobsEffectRunner } from '@gongyu/jobs/runtime';
import { Effect, Schema } from 'effect';
import { makeRequestEffectRunner, RequestInfo } from '../app/effect/runtime';

class SessionProbeRow extends Schema.Class<SessionProbeRow>('SessionProbeRow')({
    ok: Schema.Number,
}) {}

function sessionProbe(constraint: D1SessionConstraint) {
    const runner = makeRequestEffectRunner({
        bucket: env.UPLOADS,
        database: env.DB,
        encryptionKeyring:
            '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}',
        requestId: `probe-${constraint}`,
        sessionConstraint: constraint,
    });

    return Effect.promise(() =>
        runner.runPromise(
            Effect.gen(function* () {
                const requestInfo = yield* RequestInfo;
                const d1Store = yield* D1Store;
                const result = yield* d1Store.query(
                    SessionProbeRow,
                    'SELECT 1 AS ok',
                );
                return {
                    constraint: requestInfo.sessionConstraint,
                    ok: result.rows[0]?.ok,
                    rowsRead: result.meta.rowsRead,
                };
            }),
        ),
    );
}

it.effect('runs anonymous reads in an unconstrained D1 Session', () =>
    Effect.gen(function* () {
        const result = yield* sessionProbe('first-unconstrained');

        assert.strictEqual(result.constraint, 'first-unconstrained');
        assert.strictEqual(result.ok, 1);
        assert.isAtLeast(result.rowsRead, 0);
    }),
);

it.effect('runs authenticated and mutation work in a primary D1 Session', () =>
    Effect.gen(function* () {
        const result = yield* sessionProbe('first-primary');

        assert.strictEqual(result.constraint, 'first-primary');
        assert.strictEqual(result.ok, 1);
        assert.isAtLeast(result.rowsRead, 0);
    }),
);

it.effect(
    'runs jobs invocations through their own primary-session boundary',
    () =>
        Effect.gen(function* () {
            const runner = makeJobsEffectRunner({
                database: env.DB,
                invocationId: 'workflow-test',
                objectStorage: env.UPLOADS,
                trigger: 'workflow',
            });
            const result = yield* Effect.promise(() =>
                runner.runPromise(
                    Effect.gen(function* () {
                        const invocation = yield* JobsInvocationInfo;
                        const d1Store = yield* D1Store;
                        const row = yield* d1Store.first(
                            SessionProbeRow,
                            'SELECT 1 AS ok',
                        );
                        return { invocation, ok: row?.ok };
                    }),
                ),
            );

            assert.strictEqual(result.invocation.invocationId, 'workflow-test');
            assert.strictEqual(result.invocation.trigger, 'workflow');
            assert.strictEqual(result.ok, 1);
        }),
);
