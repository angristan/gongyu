import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { D1Store } from '@gongyu/data/d1-store';
import { PreviewBackfillRepository } from '@gongyu/data/preview-backfill-repository';
import type { ThumbnailImagesBinding } from '@gongyu/integrations/thumbnail-client';
import { JobsInvocationInfo, makeJobsEffectRunner } from '@gongyu/jobs/runtime';
import { backgroundHandlers } from '@gongyu/jobs/worker';
import { Effect, Schema } from 'effect';
import { makeRequestEffectRunner, RequestInfo } from '../app/effect/runtime';

class SessionProbeRow extends Schema.Class<SessionProbeRow>('SessionProbeRow')({
    ok: Schema.Number,
}) {}

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}

const unusedImagesBinding: ThumbnailImagesBinding = {
    input() {
        throw new Error('Thumbnail transformation is not used by this test.');
    },
};

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

it('routes invalid Queue messages through the background retry boundary', async () => {
    let acknowledged = false;
    let retryDelaySeconds: number | null = null;
    const message = {
        ack() {
            acknowledged = true;
        },
        attempts: 1,
        body: { invalid: true },
        id: 'invalid-message',
        retry(options?: QueueRetryOptions) {
            retryDelaySeconds = options?.delaySeconds ?? 0;
        },
        timestamp: new Date(),
    };
    const batch = {
        ackAll() {},
        messages: [message],
        metadata: {
            metrics: {
                backlogBytes: 0,
                backlogCount: 1,
            },
        },
        queue: 'gongyu-phase0-jobs',
        retryAll() {},
    };

    await backgroundHandlers.queue(batch, env);

    assert.isFalse(acknowledged);
    assert.strictEqual(retryDelaySeconds, 30);
});

it('runs scheduled maintenance through the merged Worker handler', async () => {
    const tokenHash = `expired-${crypto.randomUUID()}`;
    await env.DB.prepare(
        `
            INSERT INTO sessions (
                token_hash,
                csrf_token_hash,
                created_at,
                last_seen_at,
                idle_expires_at,
                absolute_expires_at
            ) VALUES (?, ?, 0, 0, 0, 0)
        `,
    )
        .bind(tokenHash, 'expired-csrf')
        .run();

    await backgroundHandlers.scheduled(
        {
            cron: '* * * * *',
            noRetry() {},
            scheduledTime: Date.now(),
        },
        env,
    );

    const expired = await env.DB.prepare(
        'SELECT token_hash FROM sessions WHERE token_hash = ?',
    )
        .bind(tokenHash)
        .first();
    assert.isNull(expired);
});

it('admits at most five preview backfill items per scheduled run', async () => {
    const now = Date.now() * 1_000;
    await env.DB.batch(
        Array.from({ length: 6 }, (_, index) =>
            env.DB.prepare(
                `
                    INSERT INTO bookmarks (
                        short_url,
                        url,
                        title,
                        created_at,
                        updated_at,
                        metadata_state
                    ) VALUES (?, ?, ?, ?, ?, 'completed')
                `,
            ).bind(
                `Prev${String(index).padStart(4, '0')}`,
                `https://example.com/runtime-preview-${index}`,
                `Runtime preview ${index}`,
                now + index,
                now + index,
            ),
        ),
    );
    const effect = makeJobsEffectRunner({
        database: env.DB,
        encryptionKeyring:
            '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}',
        images: unusedImagesBinding,
        invocationId: 'scheduled-backfill-test',
        objectStorage: env.UPLOADS,
        trigger: 'scheduled',
    });
    assert.isTrue(
        await effect.runPromise(
            Effect.gen(function* () {
                const backfill = yield* PreviewBackfillRepository;
                return yield* backfill.start({
                    itemLimit: 10,
                    now,
                    runId: 'runtime-backfill',
                });
            }),
        ),
    );

    await env.DB.prepare(
        `UPDATE app_state SET read_only = 1, reason = 'restore:test' WHERE singleton_id = 1`,
    ).run();
    await backgroundHandlers.scheduled(
        {
            cron: '* * * * *',
            noRetry() {},
            scheduledTime: Date.now(),
        },
        env,
    );
    let queued = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM preview_backfill_items WHERE state = 'queued'`,
    ).first<CountRow>();
    assert.strictEqual(queued?.count, 0);

    await env.DB.prepare(
        `UPDATE app_state SET read_only = 0, reason = NULL WHERE singleton_id = 1`,
    ).run();
    await backgroundHandlers.scheduled(
        {
            cron: '* * * * *',
            noRetry() {},
            scheduledTime: Date.now(),
        },
        env,
    );

    queued = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM preview_backfill_items WHERE state = 'queued'`,
    ).first<CountRow>();
    assert.strictEqual(queued?.count, 5);
});

it.effect(
    'runs jobs invocations through their own primary-session boundary',
    () =>
        Effect.gen(function* () {
            const runner = makeJobsEffectRunner({
                database: env.DB,
                encryptionKeyring:
                    '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}',
                images: unusedImagesBinding,
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
