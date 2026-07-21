import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { WorkRepository } from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { Effect, Schema } from 'effect';
import { failDeadLetterJob, processQueueJob } from './processor';
import { makeJobsEffectRunner } from './runtime';

export { DataWorkflow } from './data-workflow';

const OUTBOX_LEASE_MICROS = 60 * 1_000_000;

function runner(env: Env, trigger: 'queue' | 'scheduled' | 'workflow') {
    if (env.ENCRYPTION_KEYS === undefined) {
        throw new Error('ENCRYPTION_KEYS is not configured.');
    }
    return makeJobsEffectRunner({
        database: env.DB,
        encryptionKeyring: env.ENCRYPTION_KEYS,
        images: env.IMAGES,
        invocationId: crypto.randomUUID(),
        objectStorage: env.UPLOADS,
        trigger,
    });
}

async function decodeQueueMessage(value: unknown): Promise<QueueJobMessage> {
    return Schema.decodeUnknownPromise(QueueJobMessage)(value);
}

export default {
    fetch() {
        return new Response('Not found', { status: 404 });
    },

    async queue(batch, env) {
        const effect = runner(env, 'queue');
        const isDeadLetter = batch.queue.endsWith('-dlq');
        for (const message of batch.messages) {
            try {
                const payload = await decodeQueueMessage(message.body);
                if (isDeadLetter) {
                    await effect.runPromise(failDeadLetterJob(payload));
                    message.ack();
                    continue;
                }
                const outcome = await effect.runPromise(
                    processQueueJob(payload),
                );
                if (outcome.retryDelaySeconds === null) {
                    message.ack();
                } else {
                    message.retry({
                        delaySeconds: outcome.retryDelaySeconds,
                    });
                }
            } catch (error) {
                console.error(
                    JSON.stringify({
                        errorClass:
                            error instanceof Error
                                ? error.constructor.name
                                : 'UnknownError',
                        event: 'queue.message.failed',
                        messageId: message.id,
                    }),
                );
                message.retry({ delaySeconds: 30 });
            }
        }
    },

    async scheduled(_controller, env) {
        const effect = runner(env, 'scheduled');
        const now = Date.now() * 1_000;
        await env.DB.withSession('first-primary').batch([
            env.DB.prepare(
                'DELETE FROM write_leases WHERE expires_at <= ?',
            ).bind(now),
            env.DB.prepare(
                `
                    DELETE FROM sessions
                    WHERE idle_expires_at <= ? OR absolute_expires_at <= ?
                `,
            ).bind(Math.floor(now / 1_000), Math.floor(now / 1_000)),
            env.DB.prepare(
                `
                    DELETE FROM webauthn_challenges
                    WHERE expires_at <= ?
                       OR (consumed_at IS NOT NULL AND consumed_at <= ?)
                `,
            ).bind(
                Math.floor(now / 1_000),
                Math.floor(now / 1_000) - 86_400_000,
            ),
        ]);
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1_000_000;
        const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1_000_000;
        await env.DB.withSession('first-primary').batch([
            env.DB.prepare(
                `DELETE FROM jobs WHERE state IN ('completed', 'failed') AND updated_at < ?`,
            ).bind(thirtyDaysAgo),
            env.DB.prepare(
                `DELETE FROM outbox WHERE state IN ('completed', 'failed') AND updated_at < ?`,
            ).bind(thirtyDaysAgo),
            env.DB.prepare('DELETE FROM audit_log WHERE occurred_at < ?').bind(
                ninetyDaysAgo,
            ),
            env.DB.prepare(
                `DELETE FROM data_runs WHERE state IN ('expired', 'failed') AND updated_at < ?`,
            ).bind(ninetyDaysAgo),
        ]);
        const token = crypto.randomUUID();
        const leases = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* WorkRepository;
                yield* repository.reconcilePendingDeletions(now);
                return yield* repository.claimOutbox({
                    leaseDurationMicros: OUTBOX_LEASE_MICROS,
                    limit: 25,
                    now,
                    token,
                });
            }),
        );
        for (const lease of leases) {
            try {
                const payload =
                    lease.payloadJson === null
                        ? QueueJobMessage.make({
                              bookmarkShortUrl: lease.bookmarkShortUrl,
                              jobId: lease.id,
                              kind: lease.kind,
                              version: 1,
                          })
                        : await decodeQueueMessage(
                              JSON.parse(lease.payloadJson),
                          );
                await env.JOBS_QUEUE.send(payload);
                await effect.runPromise(
                    Effect.gen(function* () {
                        const repository = yield* WorkRepository;
                        yield* repository.completeOutbox({
                            id: lease.id,
                            now: Date.now() * 1_000,
                            token: lease.token,
                        });
                    }),
                );
            } catch (error) {
                await effect.runPromise(
                    Effect.gen(function* () {
                        const repository = yield* WorkRepository;
                        yield* repository.releaseOutbox({
                            availableAt: Date.now() * 1_000 + 30 * 1_000_000,
                            errorCode: 'queue_dispatch_failed',
                            id: lease.id,
                            now: Date.now() * 1_000,
                            token: lease.token,
                        });
                    }),
                );
                console.error(
                    JSON.stringify({
                        errorClass:
                            error instanceof Error
                                ? error.constructor.name
                                : 'UnknownError',
                        event: 'outbox.dispatch.failed',
                        outboxId: lease.id,
                    }),
                );
            }
        }

        const expired = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* DataRunRepository;
                return yield* repository.listExpiredArtifacts(
                    Date.now() * 1_000,
                    10,
                );
            }),
        );
        for (const artifact of expired) {
            try {
                await env.UPLOADS.delete(artifact.artifactKey);
                await effect.runPromise(
                    Effect.gen(function* () {
                        const repository = yield* DataRunRepository;
                        yield* repository.expireRun(
                            artifact.id,
                            Date.now() * 1_000,
                        );
                    }),
                );
            } catch (error) {
                console.error(
                    JSON.stringify({
                        errorClass:
                            error instanceof Error
                                ? error.constructor.name
                                : 'UnknownError',
                        event: 'artifact.cleanup.failed',
                        runId: artifact.id,
                    }),
                );
            }
        }
    },
} satisfies ExportedHandler<Env>;
