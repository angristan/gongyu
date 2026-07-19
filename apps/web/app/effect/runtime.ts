import {
    makeSessionService,
    SessionService,
} from '@gongyu/auth/session-service';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
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
    | D1Store
    | R2Store
    | RequestInfo
    | SessionService;

export interface RequestEffectRunner {
    readonly runPromise: <A, E>(
        effect: Effect.Effect<A, E, RequestServices>,
    ) => Promise<A>;
}

const runtime = ManagedRuntime.make(Logger.layer([Logger.consoleStructured]));

export function makeRequestEffectRunner(options: {
    readonly bucket: R2Bucket;
    readonly database: D1Database;
    readonly requestId: string;
    readonly sessionConstraint: D1SessionConstraint;
}): RequestEffectRunner {
    const session = options.database.withSession(options.sessionConstraint);
    const d1Store = makeD1Store(session);
    const bookmarkRepository = BookmarkRepository.of(
        makeBookmarkRepository(d1Store),
    );
    const r2Store = makeR2Store(options.bucket);
    const sessionService = SessionService.of(makeSessionService(d1Store));
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
                Effect.provideService(D1Store, d1Store),
                Effect.provideService(R2Store, r2Store),
                Effect.provideService(SessionService, sessionService),
                Effect.provideService(RequestInfo, requestInfo),
            ),
        );

    return { runPromise };
}
