import {
    type OutboxDispatchLease,
    WorkRepository,
} from '@gongyu/data/work-repository';
import { QueueJobMessage } from '@gongyu/domain/jobs';
import { QueueProducer } from '@gongyu/integrations/queue-producer';
import { Effect, Schema } from 'effect';

const OUTBOX_LEASE_MICROS = 60 * 1_000_000;
const OUTBOX_RETRY_DELAY_MICROS = 30 * 1_000_000;

class OutboxPayloadError extends Schema.TaggedErrorClass<OutboxPayloadError>()(
    'OutboxPayloadError',
    { cause: Schema.optionalKey(Schema.Unknown) },
) {}

export class OutboxDispatchSummary extends Schema.Class<OutboxDispatchSummary>(
    'OutboxDispatchSummary',
)({
    claimed: Schema.Number,
    dispatched: Schema.Number,
    failed: Schema.Number,
    remaining: Schema.Number,
}) {}

function errorClass(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'UnknownError';
}

const decodeLease = Effect.fn('OutboxDispatcher.decodeLease')(function* (
    lease: OutboxDispatchLease,
) {
    if (lease.payloadJson === null) {
        return QueueJobMessage.make({
            bookmarkShortUrl: lease.bookmarkShortUrl,
            jobId: lease.id,
            kind: lease.kind,
            version: 1,
        });
    }
    const payloadJson = lease.payloadJson;
    const unknownPayload = yield* Effect.try({
        try: () => JSON.parse(payloadJson),
        catch: (cause) => OutboxPayloadError.make({ cause }),
    });
    return yield* Schema.decodeUnknownEffect(QueueJobMessage)(
        unknownPayload,
    ).pipe(Effect.mapError((cause) => OutboxPayloadError.make({ cause })));
});

const dispatchLeases = Effect.fn('OutboxDispatcher.dispatchLeases')(function* (
    leases: ReadonlyArray<OutboxDispatchLease>,
) {
    const producer = yield* QueueProducer;
    const repository = yield* WorkRepository;
    const decoded: Array<{
        readonly lease: OutboxDispatchLease;
        readonly message: QueueJobMessage;
    }> = [];
    const rejected: Array<{
        readonly error: unknown;
        readonly lease: OutboxDispatchLease;
    }> = [];

    for (const lease of leases) {
        const result = yield* decodeLease(lease).pipe(
            Effect.match({
                onFailure: (error) => ({ error, ok: false as const }),
                onSuccess: (message) => ({ message, ok: true as const }),
            }),
        );
        if (result.ok) {
            decoded.push({ lease, message: result.message });
        } else {
            rejected.push({ error: result.error, lease });
        }
    }

    const sendResult = yield* producer
        .sendBatch(decoded.map(({ message }) => message))
        .pipe(
            Effect.match({
                onFailure: (error) => ({ error, ok: false as const }),
                onSuccess: () => ({ ok: true as const }),
            }),
        );
    const completed = sendResult.ok ? decoded.map(({ lease }) => lease) : [];
    const released = [
        ...rejected.map(({ lease }) => lease),
        ...(sendResult.ok ? [] : decoded.map(({ lease }) => lease)),
    ];
    const now = Date.now() * 1_000;
    const settlements = yield* repository.settleOutbox({
        completed,
        errorCode: 'queue_dispatch_failed',
        now,
        releaseAt: now + OUTBOX_RETRY_DELAY_MICROS,
        released,
    });

    for (const rejection of rejected) {
        console.error(
            JSON.stringify({
                errorClass: errorClass(rejection.error),
                event: 'outbox.dispatch.failed',
                outboxId: rejection.lease.id,
            }),
        );
    }
    if (!sendResult.ok) {
        console.error(
            JSON.stringify({
                errorClass: errorClass(sendResult.error),
                event: 'outbox.dispatch.batch_failed',
                outboxCount: decoded.length,
            }),
        );
    }
    for (const settlement of settlements) {
        if (!settlement.settled) {
            console.warn(
                JSON.stringify({
                    event: 'outbox.dispatch.settlement_fence_lost',
                    outboxId: settlement.id,
                    state: settlement.state,
                }),
            );
        }
    }

    return {
        dispatched: completed.length,
        failed: released.length,
    };
});

export const dispatchPendingOutbox = Effect.fn(
    'OutboxDispatcher.dispatchPending',
)(function* (input: { readonly limit: number }) {
    const repository = yield* WorkRepository;
    const now = Date.now() * 1_000;
    const leases = yield* repository.claimOutbox({
        leaseDurationMicros: OUTBOX_LEASE_MICROS,
        limit: input.limit,
        now,
        token: crypto.randomUUID(),
    });
    const result = yield* dispatchLeases(leases);
    return OutboxDispatchSummary.make({
        claimed: leases.length,
        dispatched: result.dispatched,
        failed: result.failed,
        remaining: result.failed,
    });
});

export const dispatchBookmarkOutbox = Effect.fn(
    'OutboxDispatcher.dispatchBookmark',
)(function* (input: {
    readonly bookmarkShortUrl: string;
    readonly kind: OutboxDispatchLease['kind'];
    readonly limit?: number;
}) {
    const repository = yield* WorkRepository;
    const now = Date.now() * 1_000;
    const leases = yield* repository.claimOutboxForBookmark({
        bookmarkShortUrl: input.bookmarkShortUrl,
        kind: input.kind,
        leaseDurationMicros: OUTBOX_LEASE_MICROS,
        limit: input.limit ?? 25,
        now,
        token: crypto.randomUUID(),
    });
    const result = yield* dispatchLeases(leases);
    const remaining = yield* repository.countOutstandingOutbox({
        bookmarkShortUrl: input.bookmarkShortUrl,
        kind: input.kind,
    });
    return OutboxDispatchSummary.make({
        claimed: leases.length,
        dispatched: result.dispatched,
        failed: result.failed,
        remaining,
    });
});

export const dispatchBookmarkOutboxBestEffort = Effect.fn(
    'OutboxDispatcher.dispatchBookmarkBestEffort',
)(function* (input: {
    readonly bookmarkShortUrl: string;
    readonly kind: OutboxDispatchLease['kind'];
    readonly limit?: number;
}) {
    return yield* dispatchBookmarkOutbox(input).pipe(
        Effect.match({
            onFailure: (error) => {
                console.error(
                    JSON.stringify({
                        bookmarkShortUrl: input.bookmarkShortUrl,
                        errorClass: errorClass(error),
                        event: 'outbox.dispatch.immediate_failed',
                        kind: input.kind,
                    }),
                );
                return OutboxDispatchSummary.make({
                    claimed: 0,
                    dispatched: 0,
                    failed: 1,
                    remaining: 1,
                });
            },
            onSuccess: (summary) => summary,
        }),
    );
});
