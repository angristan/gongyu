import { PasskeyError } from '@gongyu/auth/service';
import { SessionService } from '@gongyu/auth/session-service';
import { D1DecodeError, D1StoreError } from '@gongyu/data/d1-store';
import { Effect } from 'effect';
import {
    type AuthenticationState,
    appendSessionCookies,
} from '../auth/session.server';
import { failure, success } from '../effect/result';
import type { RequestEffectRunner, RequestServices } from '../effect/runtime';

interface ErrorResponse {
    readonly code: string;
    readonly message: string;
    readonly status: number;
}

function describeError(error: unknown): ErrorResponse {
    if (error instanceof PasskeyError) {
        const status =
            error.code === 'verification_failed'
                ? 401
                : error.code === 'not_registered'
                  ? 404
                  : error.code === 'already_registered' ||
                      error.code === 'counter_conflict'
                    ? 409
                    : 400;
        return { code: error.code, message: error.message, status };
    }

    if (error instanceof D1StoreError || error instanceof D1DecodeError) {
        return {
            code: 'database_unavailable',
            message: 'Passkey storage is unavailable.',
            status: 503,
        };
    }

    return {
        code: 'internal_error',
        message: 'The passkey operation failed.',
        status: 500,
    };
}

export async function runPasskeyJson<A, E>(
    runner: RequestEffectRunner,
    program: Effect.Effect<A, E, RequestServices>,
): Promise<Response> {
    const result = await runner.runPromise(
        program.pipe(
            Effect.match({
                onFailure: (error) => ({
                    error: describeError(error),
                    ok: false as const,
                }),
                onSuccess: (value) => ({ ok: true as const, value }),
            }),
        ),
    );

    if (!result.ok) {
        return Response.json(
            {
                error: {
                    code: result.error.code,
                    message: result.error.message,
                },
            },
            { status: result.error.status },
        );
    }

    return Response.json(result.value);
}

export async function runPasskeySessionJson<A, E>(
    runner: RequestEffectRunner,
    authentication: AuthenticationState,
    program: Effect.Effect<A, E, RequestServices>,
): Promise<Response> {
    const result = await runner.runPromise(
        Effect.gen(function* () {
            const value = yield* program;
            const sessions = yield* SessionService;
            if (authentication.authenticated) {
                yield* sessions.invalidate(authentication.sessionToken);
            }
            const session = yield* sessions.create(Date.now());
            return { session, value };
        }).pipe(
            Effect.match({
                onFailure: (error) => failure(describeError(error)),
                onSuccess: success,
            }),
        ),
    );

    if (!result.ok) {
        return Response.json(
            {
                error: {
                    code: result.error.code,
                    message: result.error.message,
                },
            },
            { status: result.error.status },
        );
    }

    const headers = new Headers({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json',
    });
    appendSessionCookies(headers, result.value.session);
    return new Response(JSON.stringify(result.value.value), { headers });
}

export async function readRequestJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new Response('Invalid JSON body', { status: 400 });
    }
}
