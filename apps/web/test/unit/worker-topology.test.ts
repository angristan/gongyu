import { backgroundHandlers } from '@gongyu/jobs/worker';
import { Schema } from 'effect';
import { assert, it } from 'vitest';
import wranglerSource from '../../wrangler.jsonc?raw';

const QueueConsumer = Schema.Struct({ queue: Schema.String });
const QueueProducer = Schema.Struct({
    binding: Schema.String,
    queue: Schema.String,
});
const WorkflowBinding = Schema.Struct({
    binding: Schema.String,
    class_name: Schema.String,
    name: Schema.String,
    script_name: Schema.optional(Schema.String),
});
const WranglerConfig = Schema.Struct({
    env: Schema.Struct({
        production: Schema.Struct({
            images: Schema.Struct({ binding: Schema.String }),
            name: Schema.String,
            queues: Schema.Struct({
                consumers: Schema.Array(QueueConsumer),
                producers: Schema.Array(QueueProducer),
            }),
            triggers: Schema.Struct({ crons: Schema.Array(Schema.String) }),
            workflows: Schema.Array(WorkflowBinding),
        }),
    }),
});

const untrustedConfig: unknown = JSON.parse(wranglerSource);
const config = Schema.decodeUnknownSync(WranglerConfig)(untrustedConfig);

it('exports queue and scheduled handlers for the web entrypoint', () => {
    assert.isFunction(backgroundHandlers.queue);
    assert.isFunction(backgroundHandlers.scheduled);
});

it('deploys HTTP and background triggers through one production Worker', () => {
    const production = config.env.production;

    assert.strictEqual(production.name, 'gongyu-cloudflare-production');
    assert.strictEqual(production.images.binding, 'IMAGES');
    assert.deepEqual(production.triggers.crons, ['* * * * *']);
    assert.deepEqual(production.queues.producers, [
        {
            binding: 'JOBS_QUEUE',
            queue: 'gongyu-production-jobs',
        },
    ]);
    assert.deepEqual(
        production.queues.consumers.map(({ queue }) => queue),
        ['gongyu-production-jobs', 'gongyu-production-jobs-dlq'],
    );
    assert.deepEqual(production.workflows, [
        {
            binding: 'DATA_WORKFLOW',
            class_name: 'DataWorkflow',
            name: 'gongyu-production-data-workflow',
        },
    ]);
});
