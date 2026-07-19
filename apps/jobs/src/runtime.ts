import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    MetadataRepository,
    makeMetadataRepository,
} from '@gongyu/data/metadata-repository';
import {
    makeSettingsRepository,
    SettingsRepository,
} from '@gongyu/data/settings-repository';
import {
    makeSocialRepository,
    SocialRepository,
} from '@gongyu/data/social-repository';
import {
    makeWorkRepository,
    WorkRepository,
} from '@gongyu/data/work-repository';
import { Encryption, makeEncryption } from '@gongyu/integrations/encryption';
import {
    MetadataClient,
    makeMetadataClient,
} from '@gongyu/integrations/metadata-client';
import { makeR2Store, R2Store } from '@gongyu/integrations/r2-store';
import {
    makeSocialClients,
    SocialClients,
} from '@gongyu/integrations/social-clients';
import {
    makeThumbnailClient,
    ThumbnailClient,
} from '@gongyu/integrations/thumbnail-client';
import { Context, Effect, Logger, ManagedRuntime } from 'effect';

export interface JobsInvocationInfoShape {
    readonly invocationId: string;
    readonly trigger: 'queue' | 'scheduled' | 'workflow';
}

export class JobsInvocationInfo extends Context.Service<
    JobsInvocationInfo,
    JobsInvocationInfoShape
>()('@gongyu/runtime/JobsInvocationInfo') {}

export type JobsServices =
    | D1Store
    | Encryption
    | JobsInvocationInfo
    | MetadataClient
    | MetadataRepository
    | R2Store
    | SettingsRepository
    | SocialClients
    | SocialRepository
    | ThumbnailClient
    | WorkRepository;

export interface JobsEffectRunner {
    readonly runPromise: <A, E>(
        effect: Effect.Effect<A, E, JobsServices>,
    ) => Promise<A>;
}

const runtime = ManagedRuntime.make(Logger.layer([Logger.consoleStructured]));

export function makeJobsEffectRunner(options: {
    readonly database: D1Database;
    readonly encryptionKeyring: string;
    readonly invocationId: string;
    readonly objectStorage: R2Bucket;
    readonly trigger: JobsInvocationInfoShape['trigger'];
}): JobsEffectRunner {
    const d1Store = makeD1Store(options.database.withSession('first-primary'));
    const encryption = Encryption.of(makeEncryption(options.encryptionKeyring));
    const invocationInfo = JobsInvocationInfo.of({
        invocationId: options.invocationId,
        trigger: options.trigger,
    });
    const metadataClient = MetadataClient.of(makeMetadataClient());
    const metadataRepository = MetadataRepository.of(
        makeMetadataRepository(d1Store),
    );
    const r2Store = makeR2Store(options.objectStorage);
    const settingsRepository = SettingsRepository.of(
        makeSettingsRepository(d1Store, encryption),
    );
    const socialClients = SocialClients.of(makeSocialClients());
    const socialRepository = SocialRepository.of(makeSocialRepository(d1Store));
    const thumbnailClient = ThumbnailClient.of(makeThumbnailClient());
    const workRepository = WorkRepository.of(makeWorkRepository(d1Store));

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
                Effect.provideService(Encryption, encryption),
                Effect.provideService(JobsInvocationInfo, invocationInfo),
                Effect.provideService(MetadataClient, metadataClient),
                Effect.provideService(MetadataRepository, metadataRepository),
                Effect.provideService(R2Store, r2Store),
                Effect.provideService(SettingsRepository, settingsRepository),
                Effect.provideService(SocialClients, socialClients),
                Effect.provideService(SocialRepository, socialRepository),
                Effect.provideService(ThumbnailClient, thumbnailClient),
                Effect.provideService(WorkRepository, workRepository),
            ),
        );

    return { runPromise };
}
