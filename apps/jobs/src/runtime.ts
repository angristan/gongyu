import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import { makeR2Store, R2Store } from '@gongyu/integrations/r2-store';
import { Context, Effect, Logger, ManagedRuntime } from 'effect';

export interface JobsInvocationInfoShape {
    readonly invocationId: string;
    readonly trigger: 'queue' | 'scheduled' | 'workflow';
}

export class JobsInvocationInfo extends Context.Service<
    JobsInvocationInfo,
    JobsInvocationInfoShape
>()('@gongyu/runtime/JobsInvocationInfo') {}

export type JobsServices = D1Store | JobsInvocationInfo | R2Store;

export interface JobsEffectRunner {
    readonly runPromise: <A, E>(
        effect: Effect.Effect<A, E, JobsServices>,
    ) => Promise<A>;
}

const runtime = ManagedRuntime.make(Logger.layer([Logger.consoleStructured]));

export function makeJobsEffectRunner(options: {
    readonly database: D1Database;
    readonly invocationId: string;
    readonly objectStorage: R2Bucket;
    readonly trigger: JobsInvocationInfoShape['trigger'];
}): JobsEffectRunner {
    const d1Store = makeD1Store(options.database.withSession('first-primary'));
    const invocationInfo = JobsInvocationInfo.of({
        invocationId: options.invocationId,
        trigger: options.trigger,
    });
    const r2Store = makeR2Store(options.objectStorage);

    const runPromise = <A, E>(
        effect: Effect.Effect<A, E, JobsServices>,
    ): Promise<A> =>
        runtime.runPromise(
            effect.pipe(
                Effect.annotateLogs({
                    invocationId: options.invocationId,
                    trigger: options.trigger,
                }),
                Effect.provideService(D1Store, d1Store),
                Effect.provideService(JobsInvocationInfo, invocationInfo),
                Effect.provideService(R2Store, r2Store),
            ),
        );

    return { runPromise };
}
