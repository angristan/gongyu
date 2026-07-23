import { DataRunRepository } from '@gongyu/data/data-run-repository';
import {
    type FinalizedMetadata,
    MetadataRepository,
} from '@gongyu/data/metadata-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    SocialRepository,
    type SocialStagingOutcome,
} from '@gongyu/data/social-repository';
import { WorkRepository } from '@gongyu/data/work-repository';
import type { QueueJobMessage } from '@gongyu/domain/jobs';
import { MetadataError } from '@gongyu/domain/metadata';
import {
    configuredProviders,
    formatSocialPayload,
} from '@gongyu/domain/social';
import { MetadataClient } from '@gongyu/integrations/metadata-client';
import { R2Store } from '@gongyu/integrations/r2-store';
import {
    ProviderError,
    SocialClients,
} from '@gongyu/integrations/social-clients';
import {
    ThumbnailClient,
    ThumbnailError,
} from '@gongyu/integrations/thumbnail-client';
import { Effect } from 'effect';

const JOB_LEASE_MICROS = 120 * 1_000_000;
const RETRY_DELAYS_SECONDS = [30, 120, 300, 900, 1_800] as const;

export interface ProcessOutcome {
    readonly retryDelaySeconds: number | null;
}

const cleanupThumbnail = Effect.fn('Jobs.cleanupThumbnail')(function* (
    shortUrl: string,
    key: string,
) {
    const r2 = yield* R2Store;
    yield* r2.delete(key);
    const metadataRepository = yield* MetadataRepository;
    yield* metadataRepository.completeThumbnailCleanup(shortUrl, key);
});

const cleanupReplacedThumbnail = Effect.fn('Jobs.cleanupReplacedThumbnail')(
    function* (shortUrl: string) {
        const metadataRepository = yield* MetadataRepository;
        const cleanup =
            yield* metadataRepository.findThumbnailCleanup(shortUrl);
        if (cleanup !== null) {
            yield* cleanupThumbnail(shortUrl, cleanup.key);
        }
    },
);

function retryDelay(attempts: number): number {
    return (
        RETRY_DELAYS_SECONDS[
            Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1)
        ] ?? 1_800
    );
}

const stageWaitingSocial = Effect.fn('Jobs.stageWaitingSocial')(function* (
    bookmarkShortUrl: string,
    knownFinalized?: FinalizedMetadata,
) {
    const metadataRepository = yield* MetadataRepository;
    const finalized =
        knownFinalized ??
        (yield* metadataRepository.findFinalized(bookmarkShortUrl));
    if (finalized === null) {
        return null;
    }
    const socialRepository = yield* SocialRepository;
    const deliveries = yield* socialRepository.listWaiting(bookmarkShortUrl);
    const outcomes: SocialStagingOutcome[] = [];
    for (const delivery of deliveries) {
        const formatted = yield* formatSocialPayload({
            description: delivery.source.description ?? '',
            finalizedAt: finalized.finalizedAt,
            originalUrl: delivery.source.originalUrl,
            provider: delivery.provider,
            r2ThumbnailKey: finalized.thumbnailKey,
            shortUrl: delivery.source.shortUrl,
            title: delivery.source.title,
        }).pipe(
            Effect.match({
                onFailure: (error) => ({ error, ok: false as const }),
                onSuccess: (payload) => ({ ok: true as const, payload }),
            }),
        );
        outcomes.push(
            formatted.ok
                ? {
                      errorCode: null,
                      id: delivery.id,
                      payload: formatted.payload,
                  }
                : {
                      errorCode: formatted.error.code,
                      id: delivery.id,
                      payload: null,
                  },
        );
    }
    yield* socialRepository.stage({
        bookmarkShortUrl,
        finalizedAt: finalized.finalizedAt,
        now: finalized.finalizedAt,
        outcomes,
    });
    return finalized;
});

const processMetadata = Effect.fn('Jobs.processMetadata')(function* (input: {
    readonly attempts: number;
    readonly message: QueueJobMessage;
    readonly now: number;
    readonly token: string;
}) {
    const metadataRepository = yield* MetadataRepository;
    const workRepository = yield* WorkRepository;
    const target = yield* metadataRepository.findTarget(
        input.message.bookmarkShortUrl,
    );
    if (target === null) {
        yield* cleanupReplacedThumbnail(input.message.bookmarkShortUrl);
        const finalized = yield* stageWaitingSocial(
            input.message.bookmarkShortUrl,
        );
        if (finalized !== null && finalized.errorCode !== null) {
            yield* workRepository.failJob({
                errorCode: finalized.errorCode,
                id: input.message.jobId,
                needsReview: false,
                now: input.now,
                token: input.token,
            });
        } else {
            yield* workRepository.completeJob({
                id: input.message.jobId,
                now: input.now,
                token: input.token,
            });
        }
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }

    if (target.cleanupKey !== null) {
        yield* cleanupThumbnail(
            input.message.bookmarkShortUrl,
            target.cleanupKey,
        );
    }
    const metadataClient = yield* MetadataClient;
    const metadataResult = yield* metadataClient.fetch(target.url).pipe(
        Effect.match({
            onFailure: (error) => ({ ok: false as const, error }),
            onSuccess: (value) => ({ ok: true as const, value }),
        }),
    );
    if (!metadataResult.ok) {
        const error = metadataResult.error;
        if (
            error instanceof MetadataError &&
            error.retryable &&
            input.attempts < RETRY_DELAYS_SECONDS.length
        ) {
            const delay = retryDelay(input.attempts);
            yield* workRepository.releaseJob({
                availableAt: input.now + delay * 1_000_000,
                errorCode: error.code,
                id: input.message.jobId,
                now: input.now,
                token: input.token,
            });
            return { retryDelaySeconds: delay } satisfies ProcessOutcome;
        }
        const finalized = yield* metadataRepository.finalize({
            candidate: null,
            errorCode:
                error instanceof MetadataError ? error.code : 'metadata_failed',
            expectedUpdatedAt: target.updatedAt,
            now: input.now,
            shortUrl: input.message.bookmarkShortUrl,
            thumbnail: null,
            thumbnailSourceUrl: target.thumbnailUrl,
        });
        if (finalized !== null) {
            yield* stageWaitingSocial(
                input.message.bookmarkShortUrl,
                finalized,
            );
            if (finalized.cleanupKey !== null) {
                yield* cleanupThumbnail(
                    input.message.bookmarkShortUrl,
                    finalized.cleanupKey,
                );
            }
            yield* workRepository.failJob({
                errorCode:
                    error instanceof MetadataError
                        ? error.code
                        : 'metadata_failed',
                id: input.message.jobId,
                needsReview: false,
                now: input.now,
                token: input.token,
            });
        } else {
            yield* workRepository.completeJob({
                id: input.message.jobId,
                now: input.now,
                token: input.token,
            });
        }
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }

    const candidate = metadataResult.value;
    let uploadedKey: string | null = null;
    let thumbnail: {
        readonly contentType: string;
        readonly height: number;
        readonly key: string;
        readonly sha256: string;
        readonly size: number;
        readonly sourceUrl: string;
        readonly width: number;
    } | null = null;
    const imageUrl = target.thumbnailUrl ?? candidate.imageUrl;
    if (imageUrl !== null) {
        const thumbnailClient = yield* ThumbnailClient;
        const thumbnailResult = yield* thumbnailClient.fetch(imageUrl).pipe(
            Effect.match({
                onFailure: (error) => ({ ok: false as const, error }),
                onSuccess: (value) => ({ ok: true as const, value }),
            }),
        );
        if (!thumbnailResult.ok) {
            const error = thumbnailResult.error;
            if (
                error instanceof ThumbnailError &&
                error.retryable &&
                input.attempts < RETRY_DELAYS_SECONDS.length
            ) {
                const delay = retryDelay(input.attempts);
                yield* workRepository.releaseJob({
                    availableAt: input.now + delay * 1_000_000,
                    errorCode: error.code,
                    id: input.message.jobId,
                    now: input.now,
                    token: input.token,
                });
                return {
                    retryDelaySeconds: delay,
                } satisfies ProcessOutcome;
            }
        } else {
            const validated = thumbnailResult.value;
            const key = `thumbnails/${target.shortUrl}/${validated.sha256}.${validated.extension}`;
            const body = new Response(
                validated.bytes.slice().buffer as ArrayBuffer,
            ).body;
            if (body === null) {
                return yield* Effect.die(
                    new Error('Unable to stream validated thumbnail.'),
                );
            }
            const r2 = yield* R2Store;
            const uploaded = yield* r2.putStreamIfAbsent({
                body,
                contentLength: validated.bytes.byteLength,
                contentType: validated.contentType,
                key,
            });
            if (uploaded === null) {
                const existing = yield* r2.head(key);
                if (
                    existing === null ||
                    existing.size !== validated.bytes.byteLength ||
                    existing.contentType !== validated.contentType
                ) {
                    return yield* Effect.die(
                        new Error(
                            'Immutable thumbnail key has incompatible metadata.',
                        ),
                    );
                }
            } else {
                uploadedKey = key;
            }
            thumbnail = {
                contentType: validated.contentType,
                height: validated.height,
                key,
                sha256: validated.sha256,
                size: validated.bytes.byteLength,
                sourceUrl: validated.sourceUrl,
                width: validated.width,
            };
        }
    }

    const finalized = yield* metadataRepository.finalize({
        candidate,
        errorCode: null,
        expectedUpdatedAt: target.updatedAt,
        now: input.now,
        shortUrl: input.message.bookmarkShortUrl,
        thumbnail,
        thumbnailSourceUrl: imageUrl,
    });
    if (finalized === null && uploadedKey !== null) {
        const r2 = yield* R2Store;
        yield* r2.delete(uploadedKey);
    }
    if (finalized !== null) {
        yield* stageWaitingSocial(input.message.bookmarkShortUrl, finalized);
        if (finalized.cleanupKey !== null) {
            yield* cleanupThumbnail(
                input.message.bookmarkShortUrl,
                finalized.cleanupKey,
            );
        }
    }
    yield* workRepository.completeJob({
        id: input.message.jobId,
        now: input.now,
        token: input.token,
    });
    return { retryDelaySeconds: null } satisfies ProcessOutcome;
});

const processSocial = Effect.fn('Jobs.processSocial')(function* (input: {
    readonly attempts: number;
    readonly message: QueueJobMessage;
    readonly now: number;
    readonly token: string;
}) {
    const socialRepository = yield* SocialRepository;
    const workRepository = yield* WorkRepository;
    const delivery = yield* socialRepository.claim({
        id: input.message.jobId,
        leaseDurationMicros: JOB_LEASE_MICROS,
        now: input.now,
        token: input.token,
    });
    if (delivery === null) {
        const status = yield* socialRepository.getStatus(input.message.jobId);
        if (
            status !== null &&
            ['queued', 'processing', 'retrying'].includes(status.state)
        ) {
            const availableAt = Math.max(
                input.now + 30 * 1_000_000,
                status.availableAt,
                status.leaseExpiresAt ?? 0,
            );
            yield* workRepository.releaseJob({
                availableAt,
                errorCode: 'social_delivery_not_claimable',
                id: input.message.jobId,
                now: input.now,
                token: input.token,
            });
            return {
                retryDelaySeconds: Math.max(
                    30,
                    Math.ceil((availableAt - input.now) / 1_000_000),
                ),
            } satisfies ProcessOutcome;
        }
        yield* workRepository.completeJob({
            id: input.message.jobId,
            now: input.now,
            token: input.token,
        });
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }

    if (delivery.provider === 'twitter' && delivery.attempts > 1) {
        yield* socialRepository.fail({
            errorCode: 'prior_attempt_ambiguous',
            id: delivery.id,
            needsReview: true,
            now: input.now,
            token: input.token,
        });
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }

    let thumbnail: {
        readonly bytes: Uint8Array;
        readonly contentType: string;
    } | null = null;
    if (
        delivery.provider === 'bluesky' &&
        delivery.payload.r2ThumbnailKey !== null
    ) {
        const r2 = yield* R2Store;
        const object = yield* r2.get(delivery.payload.r2ThumbnailKey);
        if (object !== null && object.size <= 1_000_000) {
            thumbnail = {
                bytes: new Uint8Array(
                    yield* Effect.promise(() =>
                        new Response(object.body).arrayBuffer(),
                    ),
                ),
                contentType: object.contentType,
            };
        }
    }
    const settingsRepository = yield* SettingsRepository;
    const settings = yield* settingsRepository.get;
    if (!configuredProviders(settings).includes(delivery.provider)) {
        yield* socialRepository.fail({
            errorCode: 'missing_credentials',
            id: delivery.id,
            needsReview: false,
            now: input.now,
            token: input.token,
        });
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }
    const clients = yield* SocialClients;
    const result = yield* clients
        .deliver({
            deliveryId: delivery.id,
            payload: delivery.payload,
            provider: delivery.provider,
            settings,
            thumbnail,
        })
        .pipe(
            Effect.match({
                onFailure: (error) => ({ ok: false as const, error }),
                onSuccess: (value) => ({ ok: true as const, value }),
            }),
        );
    if (result.ok) {
        yield* socialRepository.complete({
            id: delivery.id,
            now: input.now,
            remoteId: result.value.remoteId,
            token: input.token,
        });
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }

    const providerError = result.error;
    if (
        providerError instanceof ProviderError &&
        providerError.retryable &&
        delivery.provider !== 'twitter' &&
        delivery.attempts < RETRY_DELAYS_SECONDS.length
    ) {
        const delay = retryDelay(delivery.attempts);
        yield* socialRepository.release({
            availableAt: input.now + delay * 1_000_000,
            errorCode: providerError.code,
            id: delivery.id,
            now: input.now,
            token: input.token,
        });
        return { retryDelaySeconds: delay } satisfies ProcessOutcome;
    }
    const ambiguous =
        providerError instanceof ProviderError && providerError.ambiguous;
    const errorCode =
        providerError instanceof ProviderError
            ? providerError.code
            : 'provider_failed';
    yield* socialRepository.fail({
        errorCode,
        id: delivery.id,
        needsReview: ambiguous,
        now: input.now,
        token: input.token,
    });
    return { retryDelaySeconds: null } satisfies ProcessOutcome;
});

export const failDeadLetterJob = Effect.fn('Jobs.failDeadLetterJob')(function* (
    message: QueueJobMessage,
) {
    const now = Date.now() * 1_000;
    const workRepository = yield* WorkRepository;
    yield* workRepository.ensureJob(message, now);
    yield* workRepository.terminalizeDeadLetter(message.jobId, now);
});

export const processQueueJob = Effect.fn('Jobs.processQueueJob')(function* (
    message: QueueJobMessage,
) {
    const now = Date.now() * 1_000;
    const token = crypto.randomUUID();
    const workRepository = yield* WorkRepository;
    const lease = yield* workRepository.acquireJob({
        leaseDurationMicros: JOB_LEASE_MICROS,
        message,
        now,
        token,
    });
    if (lease === null) {
        const dataRuns = yield* DataRunRepository;
        if ((yield* dataRuns.getAppState).readOnly === 1) {
            return { retryDelaySeconds: 30 } satisfies ProcessOutcome;
        }
        const status = yield* workRepository.getJobStatus(message.jobId);
        if (status?.state === 'processing' && status.leaseExpiresAt !== null) {
            return {
                retryDelaySeconds: Math.max(
                    30,
                    Math.ceil((status.leaseExpiresAt - now) / 1_000_000),
                ),
            } satisfies ProcessOutcome;
        }
        if (status?.state === 'retrying' && status.availableAt > now) {
            return {
                retryDelaySeconds: Math.max(
                    1,
                    Math.ceil((status.availableAt - now) / 1_000_000),
                ),
            } satisfies ProcessOutcome;
        }
        return { retryDelaySeconds: null } satisfies ProcessOutcome;
    }
    if (message.kind === 'metadata') {
        return yield* processMetadata({
            attempts: lease.attempts,
            message,
            now,
            token,
        });
    }
    if (message.kind === 'social') {
        return yield* processSocial({
            attempts: lease.attempts,
            message,
            now,
            token,
        });
    }
    const metadataRepository = yield* MetadataRepository;
    const deletion = yield* metadataRepository.findPendingDeletion(
        message.bookmarkShortUrl,
    );
    if (deletion !== null) {
        const r2 = yield* R2Store;
        if (deletion.key !== null) {
            yield* r2.delete(deletion.key);
        }
        if (
            deletion.cleanupKey !== null &&
            deletion.cleanupKey !== deletion.key
        ) {
            yield* r2.delete(deletion.cleanupKey);
        }
        yield* metadataRepository.finalizeDeletion(message.bookmarkShortUrl);
    }
    yield* workRepository.completeJob({
        id: message.jobId,
        now,
        token,
    });
    return { retryDelaySeconds: null } satisfies ProcessOutcome;
});
