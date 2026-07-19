import { WorkRepository } from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { Effect, Schema } from 'effect';
import { failDeadLetterJob, processQueueJob } from './processor';
import { makeJobsEffectRunner } from './runtime';

export { Phase0Workflow } from './phase0-workflow';

const OUTBOX_LEASE_MICROS = 60 * 1_000_000;

function runner(env: Env, trigger: 'queue' | 'scheduled' | 'workflow') {
    if (env.ENCRYPTION_KEYS === undefined) {
        throw new Error('ENCRYPTION_KEYS is not configured.');
    }
    return makeJobsEffectRunner({
        database: env.DB,
        encryptionKeyring: env.ENCRYPTION_KEYS,
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
    },
} satisfies ExportedHandler<Env>;
