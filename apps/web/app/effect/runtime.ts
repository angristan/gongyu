import {
    makeSessionService,
    SessionService,
} from '@gongyu/auth/session-service';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    DashboardRepository,
    makeDashboardRepository,
} from '@gongyu/data/dashboard-repository';
import {
    DataRunRepository,
    makeDataRunRepository,
} from '@gongyu/data/data-run-repository';
import {
    MetadataRepository,
    makeMetadataRepository,
} from '@gongyu/data/metadata-repository';
import {
    makeSettingsRepository,
    SettingsRepository,
} from '@gongyu/data/settings-repository';
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
import { Context, Effect, Logger, ManagedRuntime } from 'effect';

export interface RequestInfoShape {
    readonly requestId: string;
    readonly sessionConstraint: D1SessionConstraint;
}

export class RequestInfo extends Context.Service<
    RequestInfo,
    RequestInfoShape
>()('@gongyu/runtime/RequestInfo') {}

export type RequestServices =
    | BookmarkRepository
    | DashboardRepository
    | DataRunRepository
    | D1Store
    | Encryption
    | MetadataClient
    | MetadataRepository
    | R2Store
    | RequestInfo
    | SessionService
    | SettingsRepository
    | WorkRepository;

export interface RequestEffectRunner {
    readonly runPromise: <A, E>(
        effect: Effect.Effect<A, E, RequestServices>,
    ) => Promise<A>;
}

const runtime = ManagedRuntime.make(Logger.layer([Logger.consoleStructured]));

export function makeRequestEffectRunner(options: {
    readonly bucket: R2Bucket;
    readonly database: D1Database;
    readonly encryptionKeyring: string;
    readonly requestId: string;
    readonly sessionConstraint: D1SessionConstraint;
}): RequestEffectRunner {
    const session = options.database.withSession(options.sessionConstraint);
    const d1Store = makeD1Store(session);
    const bookmarkRepository = BookmarkRepository.of(
        makeBookmarkRepository(d1Store),
    );
    const dataRunRepository = DataRunRepository.of(
        makeDataRunRepository(d1Store),
    );
    const dashboardRepository = DashboardRepository.of(
        makeDashboardRepository(d1Store, bookmarkRepository),
    );
    const encryption = Encryption.of(makeEncryption(options.encryptionKeyring));
    const metadataClient = MetadataClient.of(makeMetadataClient());
    const metadataRepository = MetadataRepository.of(
        makeMetadataRepository(d1Store),
    );
    const r2Store = makeR2Store(options.bucket);
    const sessionService = SessionService.of(makeSessionService(d1Store));
    const settingsRepository = SettingsRepository.of(
        makeSettingsRepository(d1Store, encryption),
    );
    const workRepository = WorkRepository.of(makeWorkRepository(d1Store));
    const requestInfo = RequestInfo.of({
        requestId: options.requestId,
        sessionConstraint: options.sessionConstraint,
    });

    const runPromise = <A, E>(
        effect: Effect.Effect<A, E, RequestServices>,
    ): Promise<A> =>
        runtime.runPromise(
            effect.pipe(
                Effect.annotateLogs({
                    requestId: options.requestId,
                    sessionConstraint: options.sessionConstraint,
                }),
                Effect.provideService(BookmarkRepository, bookmarkRepository),
                Effect.provideService(DataRunRepository, dataRunRepository),
                Effect.provideService(DashboardRepository, dashboardRepository),
                Effect.provideService(D1Store, d1Store),
                Effect.provideService(Encryption, encryption),
                Effect.provideService(MetadataClient, metadataClient),
                Effect.provideService(MetadataRepository, metadataRepository),
                Effect.provideService(R2Store, r2Store),
                Effect.provideService(SessionService, sessionService),
                Effect.provideService(SettingsRepository, settingsRepository),
                Effect.provideService(WorkRepository, workRepository),
                Effect.provideService(RequestInfo, requestInfo),
            ),
        );

    return { runPromise };
}
