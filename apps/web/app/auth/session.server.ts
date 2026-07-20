import {
    type AuthenticatedSession,
    type NewSession,
    SessionService,
} from '@gongyu/auth/session-service';
import {
    DataRunRepository,
    ReadOnlyError,
} from '@gongyu/data/data-run-repository';
import { Effect } from 'effect';
import type { RequestEffectRunner } from '../effect/runtime';

export const SESSION_COOKIE_NAME = '__Host-gongyu-session';
export const CSRF_COOKIE_NAME = '__Host-gongyu-csrf';

export type AuthenticationState =
    | {
          readonly authenticated: false;
          readonly clearInvalidCookies: boolean;
      }
    | {
          readonly authenticated: true;
          readonly csrfToken: string | null;
          readonly session: AuthenticatedSession;
          readonly sessionToken: string;
      };

export function getCookie(request: Request, name: string): string | null {
    const header = request.headers.get('Cookie');
    if (header === null) {
        return null;
    }
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) {
            continue;
        }
        const key = part.slice(0, separator).trim();
        if (key !== name) {
            continue;
        }
        const value = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(value);
        } catch {
            return null;
        }
    }
    return null;
}

export function requestSessionConstraint(
    request: Request,
): D1SessionConstraint {
    const hasSessionCookie = getCookie(request, SESSION_COOKIE_NAME) !== null;
    return (request.method === 'GET' || request.method === 'HEAD') &&
        !hasSessionCookie
        ? 'first-unconstrained'
        : 'first-primary';
}

export async function resolveAuthentication(
    runner: RequestEffectRunner,
    request: Request,
): Promise<AuthenticationState> {
    const sessionToken = getCookie(request, SESSION_COOKIE_NAME);
    if (sessionToken === null || sessionToken === '') {
        return { authenticated: false, clearInvalidCookies: false };
    }

    const session = await runner.runPromise(
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            return yield* sessions.authenticate(sessionToken, Date.now());
        }),
    );
    if (session === null) {
        return { authenticated: false, clearInvalidCookies: true };
    }

    return {
        authenticated: true,
        csrfToken: getCookie(request, CSRF_COOKIE_NAME),
        session,
        sessionToken,
    };
}

function cookieExpiry(maxAgeSeconds: number): string {
    return `Max-Age=${maxAgeSeconds}; Path=/; Secure; SameSite=Lax`;
}

export function appendSessionCookies(
    headers: Headers,
    session: NewSession,
    now = Date.now(),
): void {
    const maxAgeSeconds = Math.max(
        0,
        Math.floor((session.absoluteExpiresAt - now) / 1_000),
    );
    headers.append(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}; ${cookieExpiry(maxAgeSeconds)}; HttpOnly`,
    );
    headers.append(
        'Set-Cookie',
        `${CSRF_COOKIE_NAME}=${encodeURIComponent(session.csrfToken)}; ${cookieExpiry(maxAgeSeconds)}`,
    );
}

export function appendClearedSessionCookies(headers: Headers): void {
    headers.append(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; SameSite=Lax; HttpOnly`,
    );
    headers.append(
        'Set-Cookie',
        `${CSRF_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; SameSite=Lax`,
    );
}

export function requireAuthentication(
    authentication: AuthenticationState,
): asserts authentication is Extract<
    AuthenticationState,
    { readonly authenticated: true }
> {
    if (!authentication.authenticated) {
        throw new Response('Authentication required', { status: 401 });
    }
}

async function requestCsrfToken(request: Request): Promise<string | null> {
    const header = request.headers.get('X-CSRF-Token');
    if (header !== null) {
        return header;
    }
    const contentType = request.headers.get('Content-Type') ?? '';
    if (
        !contentType.startsWith('application/x-www-form-urlencoded') &&
        !contentType.startsWith('multipart/form-data')
    ) {
        return null;
    }
    const value = (await request.clone().formData()).get('_csrf');
    return typeof value === 'string' ? value : null;
}

export async function requireAuthenticatedMutation(input: {
    readonly authentication: AuthenticationState;
    readonly expectedOrigin: string;
    readonly request: Request;
    readonly requireWritable?: boolean;
    readonly runner: RequestEffectRunner;
    readonly submittedCsrfToken?: string | null;
}): Promise<void> {
    const authentication = input.authentication;
    requireAuthentication(authentication);
    if (input.request.headers.get('Origin') !== input.expectedOrigin) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }

    const submittedToken =
        input.submittedCsrfToken === undefined
            ? await requestCsrfToken(input.request)
            : input.submittedCsrfToken;
    const cookieToken = authentication.csrfToken;
    if (
        submittedToken === null ||
        cookieToken === null ||
        submittedToken !== cookieToken
    ) {
        throw new Response('CSRF validation failed', { status: 403 });
    }

    const valid = await input.runner.runPromise(
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            return yield* sessions.verifyCsrf(
                authentication.session,
                submittedToken,
            );
        }),
    );
    if (!valid) {
        throw new Response('CSRF validation failed', { status: 403 });
    }
    if (input.requireWritable === true) {
        await input.runner
            .runPromise(
                Effect.gen(function* () {
                    const dataRuns = yield* DataRunRepository;
                    return yield* dataRuns.assertWritable;
                }),
            )
            .catch((error: unknown) => {
                if (error instanceof ReadOnlyError) {
                    throw new Response(
                        'Gongyu is temporarily read-only for data recovery.',
                        { status: 503 },
                    );
                }
                throw error;
            });
    }
}
