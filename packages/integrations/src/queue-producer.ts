import type { QueueJobMessage } from '@gongyu/domain/jobs';
import { Context, Effect, Schema } from 'effect';

export class QueueProducerError extends Schema.TaggedErrorClass<QueueProducerError>()(
    'QueueProducerError',
    {
        cause: Schema.optionalKey(Schema.Unknown),
        message: Schema.String,
    },
) {}

export interface QueueProducerShape {
    readonly send: (
        message: QueueJobMessage,
    ) => Effect.Effect<void, QueueProducerError>;
}

export class QueueProducer extends Context.Service<
    QueueProducer,
    QueueProducerShape
>()('@gongyu/runtime/QueueProducer') {}

export function makeQueueProducer(queue: Queue): QueueProducerShape {
    const send = Effect.fn('QueueProducer.send')(function* (
        message: QueueJobMessage,
    ) {
        yield* Effect.annotateCurrentSpan({
            'queue.job.id': message.jobId,
            'queue.job.kind': message.kind,
        });
        yield* Effect.tryPromise({
            try: () => queue.send(message),
            catch: (cause) =>
                QueueProducerError.make({
                    cause,
                    message: 'Queue message could not be persisted.',
                }),
        });
    });

    return { send };
}
