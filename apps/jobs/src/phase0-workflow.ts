import {
    WorkflowEntrypoint,
    type WorkflowEvent,
    type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { D1Store } from '@gongyu/data/d1-store';
import { Phase0WorkflowPayload } from '@gongyu/domain/workflows';
import { R2Store } from '@gongyu/integrations/r2-store';
import { Effect, Schema } from 'effect';
import { makeJobsEffectRunner } from './runtime';

const decodePayload = Effect.fn('Workflow.decodePayload')(function* (
    input: unknown,
) {
    return yield* Schema.decodeUnknownEffect(Phase0WorkflowPayload)(input);
});

const loadSource = Effect.fn('Workflow.loadSource')(function* (key: string) {
    const r2Store = yield* R2Store;
    return yield* r2Store.head(key);
});

const recordWorkflow = Effect.fn('Workflow.recordCheckpoint')(
    function* (input: {
        readonly completedAt: number;
        readonly etag: string;
        readonly instanceId: string;
        readonly key: string;
        readonly operation: string;
        readonly size: number;
        readonly version: number;
    }) {
        const d1Store = yield* D1Store;
        yield* d1Store.run(
            `
                INSERT INTO phase0_workflow_runs (
                    instance_id,
                    payload_version,
                    operation,
                    object_key,
                    object_etag,
                    object_size,
                    status,
                    completed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'complete', ?)
                ON CONFLICT(instance_id) DO UPDATE SET
                    object_etag = excluded.object_etag,
                    object_size = excluded.object_size,
                    status = excluded.status,
                    completed_at = excluded.completed_at
            `,
            [
                input.instanceId,
                input.version,
                input.operation,
                input.key,
                input.etag,
                input.size,
                input.completedAt,
            ],
        );
    },
);

export class Phase0Workflow extends WorkflowEntrypoint<
    Env,
    Phase0WorkflowPayload
> {
    async run(
        event: Readonly<WorkflowEvent<Phase0WorkflowPayload>>,
        step: WorkflowStep,
    ) {
        const effect = makeJobsEffectRunner({
            database: this.env.DB,
            invocationId: event.instanceId,
            objectStorage: this.env.UPLOADS,
            trigger: 'workflow',
        });
        const decoded = await effect.runPromise(
            decodePayload(event.payload).pipe(
                Effect.match({
                    onFailure: () => ({ ok: false as const }),
                    onSuccess: (payload) => ({ ok: true as const, payload }),
                }),
            ),
        );
        if (!decoded.ok) {
            throw new NonRetryableError(
                'Workflow payload does not match version 1.',
            );
        }
        const payload = decoded.payload;

        const source = await step.do(
            'verify immutable R2 source',
            {
                retries: {
                    backoff: 'exponential',
                    delay: '2 seconds',
                    limit: 3,
                },
                timeout: '1 minute',
            },
            async () => {
                const result = await effect.runPromise(
                    loadSource(payload.source.key).pipe(
                        Effect.match({
                            onFailure: () => ({ ok: false as const }),
                            onSuccess: (object) => ({
                                object,
                                ok: true as const,
                            }),
                        }),
                    ),
                );
                if (!result.ok) {
                    throw new Error('Workflow source metadata is unavailable.');
                }
                if (result.object === null) {
                    throw new NonRetryableError(
                        'Workflow source object does not exist.',
                    );
                }
                if (
                    result.object.etag !== payload.source.etag ||
                    result.object.size !== payload.source.size
                ) {
                    throw new NonRetryableError(
                        'Workflow source metadata does not match its immutable reference.',
                    );
                }

                return {
                    etag: result.object.etag,
                    key: result.object.key,
                    size: result.object.size,
                };
            },
        );

        await step.do(
            'record validated workflow',
            {
                retries: {
                    backoff: 'exponential',
                    delay: '2 seconds',
                    limit: 3,
                },
                timeout: '1 minute',
            },
            async () => {
                const result = await effect.runPromise(
                    recordWorkflow({
                        completedAt: event.timestamp.getTime(),
                        etag: source.etag,
                        instanceId: event.instanceId,
                        key: source.key,
                        operation: payload.operation,
                        size: source.size,
                        version: payload.version,
                    }).pipe(
                        Effect.match({
                            onFailure: () => ({ ok: false as const }),
                            onSuccess: () => ({ ok: true as const }),
                        }),
                    ),
                );
                if (!result.ok) {
                    throw new Error('Workflow checkpoint write failed.');
                }

                return { recorded: true };
            },
        );

        return {
            object: source,
            operation: payload.operation,
            version: payload.version,
        };
    }
}
