import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { D1Store } from '@gongyu/data/d1-store';
import { MetadataRepository } from '@gongyu/data/metadata-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { MetadataCandidate } from '@gongyu/domain/metadata';
import type { ThumbnailImagesBinding } from '@gongyu/integrations/thumbnail-client';
import { JobsInvocationInfo, makeJobsEffectRunner } from '@gongyu/jobs/runtime';
import { backgroundHandlers } from '@gongyu/jobs/worker';
import { Effect, Schema } from 'effect';
import { makeRequestEffectRunner, RequestInfo } from '../app/effect/runtime';

class SessionProbeRow extends Schema.Class<SessionProbeRow>('SessionProbeRow')({
    ok: Schema.Number,
}) {}

class QueueStateRow extends Schema.Class<QueueStateRow>('QueueStateRow')({
    state: Schema.String,
}) {}

function queueResponse(): QueueSendResponse {
    return {
        metadata: { metrics: { backlogBytes: 0, backlogCount: 0 } },
    };
}

function queueBatchResponse(): QueueSendBatchResponse {
    return {
        metadata: { metrics: { backlogBytes: 0, backlogCount: 0 } },
    };
}

function makeRecordingQueue(input: {
    readonly sent: unknown[];
    remainingFailures: number;
}): Queue {
    return {
        metrics: async () => ({ backlogBytes: 0, backlogCount: 0 }),
        async send(message) {
            if (input.remainingFailures > 0) {
                input.remainingFailures -= 1;
                throw new Error('Injected Queue send failure.');
            }
            input.sent.push(message);
            return queueResponse();
        },
        async sendBatch(messages) {
            for (const message of messages) {
                input.sent.push(message.body);
            }
            return queueBatchResponse();
        },
    };
}

function queueMessage(
    body: QueueJobMessage,
    state: {
        acknowledged: boolean;
        retryDelaySeconds: number | null;
    },
): Message<unknown> {
    return {
        ack() {
            state.acknowledged = true;
        },
        attempts: 1,
        body,
        id: `message-${crypto.randomUUID()}`,
        retry(options?: QueueRetryOptions) {
            state.retryDelaySeconds = options?.delaySeconds ?? 0;
        },
        timestamp: new Date(),
    };
}

function queueBatch(message: Message<unknown>): MessageBatch<unknown> {
    return {
        ackAll() {},
        messages: [message],
        metadata: {
            metrics: { backlogBytes: 0, backlogCount: 1 },
        },
        queue: 'gongyu-phase0-jobs',
        retryAll() {},
    };
}

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
        queue: env.JOBS_QUEUE,
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

it('chains social work before acknowledging metadata and recovers send failure', async () => {
    const sent: unknown[] = [];
    const queueControl = { remainingFailures: 1, sent };
    const queue = makeRecordingQueue(queueControl);
    const keyring =
        '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}';
    const requestRunner = makeRequestEffectRunner({
        bucket: env.UPLOADS,
        database: env.DB,
        encryptionKeyring: keyring,
        queue,
        requestId: 'queue-chain-setup',
        sessionConstraint: 'first-primary',
    });
    const bookmark = await requestRunner.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const metadata = yield* MetadataRepository;
            const createdAt = Date.now() * 1_000;
            const bookmark = yield* bookmarks.create({
                createdAt,
                description: null,
                socialProviders: ['mastodon'],
                title: 'Queue chain',
                url: `https://example.com/queue-chain-${crypto.randomUUID()}`,
            });
            yield* metadata.finalize({
                candidate: MetadataCandidate.make({
                    description: null,
                    imageUrl: null,
                    title: 'Queue chain metadata',
                }),
                errorCode: null,
                expectedUpdatedAt: bookmark.updatedAt,
                now: createdAt + 1_000,
                shortUrl: bookmark.shortUrl,
                thumbnail: null,
                thumbnailSourceUrl: null,
            });
            return bookmark;
        }),
    );
    const metadataMessage = QueueJobMessage.make({
        bookmarkShortUrl: bookmark.shortUrl,
        jobId: `metadata:${bookmark.shortUrl}:1`,
        kind: 'metadata',
        version: 1,
    });
    const backgroundEnv = {
        DB: env.DB,
        ENCRYPTION_KEYS: keyring,
        IMAGES: unusedImagesBinding,
        JOBS_QUEUE: queue,
        UPLOADS: env.UPLOADS,
    };
    const firstState = {
        acknowledged: false,
        retryDelaySeconds: null as number | null,
    };

    await backgroundHandlers.queue(
        queueBatch(queueMessage(metadataMessage, firstState)),
        backgroundEnv,
    );
    const released = await env.DB.prepare(
        `SELECT state FROM outbox WHERE id = ?`,
    )
        .bind(`social:${bookmark.shortUrl}:mastodon:v1`)
        .first<QueueStateRow>();

    assert.isFalse(firstState.acknowledged);
    assert.strictEqual(firstState.retryDelaySeconds, 30);
    assert.strictEqual(released?.state, 'pending');
    assert.lengthOf(sent, 0);

    await env.DB.prepare(`UPDATE outbox SET available_at = 0 WHERE id = ?`)
        .bind(`social:${bookmark.shortUrl}:mastodon:v1`)
        .run();
    const secondState = {
        acknowledged: false,
        retryDelaySeconds: null as number | null,
    };
    await backgroundHandlers.queue(
        queueBatch(queueMessage(metadataMessage, secondState)),
        backgroundEnv,
    );
    const completed = await env.DB.prepare(
        `SELECT state FROM outbox WHERE id = ?`,
    )
        .bind(`social:${bookmark.shortUrl}:mastodon:v1`)
        .first<QueueStateRow>();
    const child = await Schema.decodeUnknownPromise(QueueJobMessage)(sent[0]);

    assert.isTrue(secondState.acknowledged);
    assert.isNull(secondState.retryDelaySeconds);
    assert.strictEqual(child.kind, 'social');
    assert.strictEqual(completed?.state, 'completed');
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
                queue: env.JOBS_QUEUE,
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
