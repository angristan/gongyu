import {
    WorkflowEntrypoint,
    type WorkflowEvent,
    type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { Schema } from 'effect';
import { Phase0WorkflowPayload } from '../app/workflows/contracts';

async function decodePayload(input: unknown): Promise<Phase0WorkflowPayload> {
    try {
        return await Schema.decodeUnknownPromise(Phase0WorkflowPayload)(input);
    } catch {
        throw new NonRetryableError(
            'Workflow payload does not match version 1.',
        );
    }
}

export class Phase0Workflow extends WorkflowEntrypoint<
    Env,
    Phase0WorkflowPayload
> {
    async run(
        event: Readonly<WorkflowEvent<Phase0WorkflowPayload>>,
        step: WorkflowStep,
    ) {
        const payload = await decodePayload(event.payload);
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
                const object = await this.env.UPLOADS.head(payload.source.key);
                if (object === null) {
                    throw new NonRetryableError(
                        'Workflow source object does not exist.',
                    );
                }
                if (
                    object.httpEtag !== payload.source.etag ||
                    object.size !== payload.source.size
                ) {
                    throw new NonRetryableError(
                        'Workflow source metadata does not match its immutable reference.',
                    );
                }

                return {
                    etag: object.httpEtag,
                    key: object.key,
                    size: object.size,
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
                const session = this.env.DB.withSession('first-primary');
                const result = await session
                    .prepare(
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
                    )
                    .bind(
                        event.instanceId,
                        payload.version,
                        payload.operation,
                        source.key,
                        source.etag,
                        source.size,
                        event.timestamp.getTime(),
                    )
                    .run();
                if (!result.success) {
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
