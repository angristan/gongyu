import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { WorkRepository } from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import type { ThumbnailImagesBinding } from '@gongyu/integrations/thumbnail-client';
import { Effect, Schema } from 'effect';
import {
    dispatchBookmarkOutbox,
    dispatchPendingOutbox,
} from './outbox-dispatcher';
import { failDeadLetterJob, processQueueJob } from './processor';
import { makeJobsEffectRunner } from './runtime';

export interface BackgroundEnv {
    readonly DB: D1Database;
    readonly ENCRYPTION_KEYS?: string;
    readonly IMAGES: ThumbnailImagesBinding;
    readonly JOBS_QUEUE: Queue;
    readonly UPLOADS: R2Bucket;
}

const TERMINAL_HISTORY_RETENTION_MICROS = 7 * 24 * 60 * 60 * 1_000_000;
const TERMINAL_HISTORY_PRUNE_LIMIT = 100;

function runner(
    env: BackgroundEnv,
    trigger: 'queue' | 'scheduled' | 'workflow',
) {
    if (env.ENCRYPTION_KEYS === undefined) {
        throw new Error('ENCRYPTION_KEYS is not configured.');
    }
    return makeJobsEffectRunner({
        database: env.DB,
        encryptionKeyring: env.ENCRYPTION_KEYS,
        images: env.IMAGES,
        invocationId: crypto.randomUUID(),
        objectStorage: env.UPLOADS,
        queue: env.JOBS_QUEUE,
        trigger,
    });
}

async function decodeQueueMessage(value: unknown): Promise<QueueJobMessage> {
    return Schema.decodeUnknownPromise(QueueJobMessage)(value);
}

export const backgroundHandlers = {
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
                if (outcome.retryDelaySeconds !== null) {
                    message.retry({
                        delaySeconds: outcome.retryDelaySeconds,
                    });
                    continue;
                }
                if (payload.kind === 'metadata') {
                    const dispatch = await effect.runPromise(
                        dispatchBookmarkOutbox({
                            bookmarkShortUrl: payload.bookmarkShortUrl,
                            kind: 'social',
                        }),
                    );
                    if (dispatch.remaining > 0) {
                        message.retry({ delaySeconds: 30 });
                        continue;
                    }
                }
                message.ack();
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
        const terminalHistoryCutoff = now - TERMINAL_HISTORY_RETENTION_MICROS;
        const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1_000_000;
        await env.DB.withSession('first-primary').batch([
            env.DB.prepare('DELETE FROM audit_log WHERE occurred_at < ?').bind(
                ninetyDaysAgo,
            ),
            env.DB.prepare(
                `DELETE FROM data_runs WHERE state IN ('expired', 'failed') AND updated_at < ?`,
            ).bind(ninetyDaysAgo),
        ]);
        const maintenance = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* WorkRepository;
                const prunedHistory = yield* repository.pruneTerminalHistory({
                    before: terminalHistoryCutoff,
                    limit: TERMINAL_HISTORY_PRUNE_LIMIT,
                });
                yield* repository.reconcilePendingDeletions(now);
                return { prunedHistory };
            }),
        );
        if (maintenance.prunedHistory > 0) {
            console.info(
                JSON.stringify({
                    event: 'job.history.pruned',
                    outboxCount: maintenance.prunedHistory,
                }),
            );
        }
        await effect.runPromise(dispatchPendingOutbox({ limit: 25 }));

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
} satisfies ExportedHandler<BackgroundEnv>;
