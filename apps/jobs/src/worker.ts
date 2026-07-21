import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { PreviewBackfillRepository } from '@gongyu/data/preview-backfill-repository';
import { WorkRepository } from '@gongyu/data/work-repository';
import { BackgroundQueueMessage, QueueJobMessage } from '@gongyu/domain/jobs';
import type { ThumbnailImagesBinding } from '@gongyu/integrations/thumbnail-client';
import { Effect, Schema } from 'effect';
import { failDeadLetterJob, processQueueJob } from './processor';
import { makeJobsEffectRunner } from './runtime';

export interface BackgroundEnv {
    readonly DB: D1Database;
    readonly ENCRYPTION_KEYS?: string;
    readonly IMAGES: ThumbnailImagesBinding;
    readonly JOBS_QUEUE: Queue;
    readonly UPLOADS: R2Bucket;
}

const OUTBOX_LEASE_MICROS = 60 * 1_000_000;
const TERMINAL_HISTORY_RETENTION_MICROS = 7 * 24 * 60 * 60 * 1_000_000;
const TERMINAL_HISTORY_PRUNE_LIMIT = 100;
const PREVIEW_BACKFILL_BATCH_LIMIT = 5;
const PREVIEW_BACKFILL_MAX_IN_FLIGHT = 10;

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
        trigger,
    });
}

async function decodeQueueMessage(
    value: unknown,
): Promise<BackgroundQueueMessage> {
    return Schema.decodeUnknownPromise(BackgroundQueueMessage)(value);
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
        const token = crypto.randomUUID();
        const maintenance = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* WorkRepository;
                const dataRuns = yield* DataRunRepository;
                const previewBackfill = yield* PreviewBackfillRepository;
                const prunedHistory = yield* repository.pruneTerminalHistory({
                    before: terminalHistoryCutoff,
                    limit: TERMINAL_HISTORY_PRUNE_LIMIT,
                });
                yield* repository.reconcilePendingDeletions(now);
                yield* previewBackfill.pruneTerminalHistory({
                    completedBefore: terminalHistoryCutoff,
                    limit: TERMINAL_HISTORY_PRUNE_LIMIT,
                });
                yield* previewBackfill.reconcile(now);
                const appState = yield* dataRuns.getAppState;
                const stagedPreviews =
                    appState.readOnly === 1
                        ? 0
                        : yield* previewBackfill.enqueueBatch({
                              batchLimit: PREVIEW_BACKFILL_BATCH_LIMIT,
                              maxInFlight: PREVIEW_BACKFILL_MAX_IN_FLIGHT,
                              now,
                          });
                const leases = yield* repository.claimOutbox({
                    leaseDurationMicros: OUTBOX_LEASE_MICROS,
                    limit: 25,
                    now,
                    token,
                });
                return { leases, prunedHistory, stagedPreviews };
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
        if (maintenance.stagedPreviews > 0) {
            console.info(
                JSON.stringify({
                    count: maintenance.stagedPreviews,
                    event: 'preview.backfill.staged',
                }),
            );
        }
        for (const lease of maintenance.leases) {
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
                        const now = Date.now() * 1_000;
                        if (
                            lease.id.startsWith('preview-backfill:') &&
                            lease.attempts >= 3
                        ) {
                            const previewBackfill =
                                yield* PreviewBackfillRepository;
                            yield* repository.failOutbox({
                                errorCode: 'queue_dispatch_failed',
                                id: lease.id,
                                now,
                                token: lease.token,
                            });
                            yield* previewBackfill.terminalizeItem({
                                errorCode: 'queue_dispatch_failed',
                                jobId: lease.id,
                                now,
                                state: 'failed',
                            });
                            return;
                        }
                        yield* repository.releaseOutbox({
                            availableAt: now + 30 * 1_000_000,
                            errorCode: 'queue_dispatch_failed',
                            id: lease.id,
                            now,
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
} satisfies ExportedHandler<BackgroundEnv>;
