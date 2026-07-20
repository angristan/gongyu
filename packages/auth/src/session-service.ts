import type { D1Store, D1StoreFailure } from '@gongyu/data/d1-store';
import { Context, Effect, Schema } from 'effect';

export const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

class SessionRow extends Schema.Class<SessionRow>('SessionRow')({
    absoluteExpiresAt: Schema.Number,
    csrfTokenHash: Schema.String,
    idleExpiresAt: Schema.Number,
    tokenHash: Schema.String,
}) {}

export class AuthenticatedSession extends Schema.Class<AuthenticatedSession>(
    'AuthenticatedSession',
)({
    absoluteExpiresAt: Schema.Number,
    csrfTokenHash: Schema.String,
    idleExpiresAt: Schema.Number,
    tokenHash: Schema.String,
}) {}

export class NewSession extends Schema.Class<NewSession>('NewSession')({
    absoluteExpiresAt: Schema.Number,
    csrfToken: Schema.String,
    idleExpiresAt: Schema.Number,
    token: Schema.String,
}) {}

export interface SessionServiceShape {
    readonly authenticate: (
        token: string,
        now: number,
    ) => Effect.Effect<AuthenticatedSession | null, D1StoreFailure>;
    readonly create: (now: number) => Effect.Effect<NewSession, D1StoreFailure>;
    readonly invalidate: (token: string) => Effect.Effect<void, D1StoreFailure>;
    readonly invalidateAll: Effect.Effect<void, D1StoreFailure>;
    readonly verifyCsrf: (
        session: AuthenticatedSession,
        token: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
}

export class SessionService extends Context.Service<
    SessionService,
    SessionServiceShape
>()('@gongyu/auth/SessionService') {}

function randomToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/u, '');
}

const hashToken = Effect.fn('Session.hashToken')(function* (token: string) {
    const digest = yield* Effect.promise(() =>
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
});

export function makeSessionService(
    d1Store: D1Store['Service'],
): SessionServiceShape {
    const create = Effect.fn('Session.create')(function* (now: number) {
        const token = randomToken();
        const csrfToken = randomToken();
        const tokenHash = yield* hashToken(token);
        const csrfTokenHash = yield* hashToken(csrfToken);
        const idleExpiresAt = now + SESSION_IDLE_TTL_MS;
        const absoluteExpiresAt = now + SESSION_ABSOLUTE_TTL_MS;

        yield* d1Store.run(
            `
                INSERT INTO sessions (
                    token_hash,
                    csrf_token_hash,
                    created_at,
                    last_seen_at,
                    idle_expires_at,
                    absolute_expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                tokenHash,
                csrfTokenHash,
                now,
                now,
                idleExpiresAt,
                absoluteExpiresAt,
            ],
        );

        return NewSession.make({
            absoluteExpiresAt,
            csrfToken,
            idleExpiresAt,
            token,
        });
    });

    const authenticate = Effect.fn('Session.authenticate')(function* (
        token: string,
        now: number,
    ) {
        const tokenHash = yield* hashToken(token);
        const row = yield* d1Store.first(
            SessionRow,
            `
                SELECT
                    token_hash AS "tokenHash",
                    csrf_token_hash AS "csrfTokenHash",
                    idle_expires_at AS "idleExpiresAt",
                    absolute_expires_at AS "absoluteExpiresAt"
                FROM sessions
                WHERE token_hash = ?
            `,
            [tokenHash],
        );
        if (row === null) {
            return null;
        }
        if (row.idleExpiresAt <= now || row.absoluteExpiresAt <= now) {
            yield* d1Store.run('DELETE FROM sessions WHERE token_hash = ?', [
                tokenHash,
            ]);
            return null;
        }

        const idleExpiresAt = Math.min(
            now + SESSION_IDLE_TTL_MS,
            row.absoluteExpiresAt,
        );
        yield* d1Store.run(
            `
                UPDATE sessions
                SET last_seen_at = ?, idle_expires_at = ?
                WHERE token_hash = ?
            `,
            [now, idleExpiresAt, tokenHash],
        );

        return AuthenticatedSession.make({
            absoluteExpiresAt: row.absoluteExpiresAt,
            csrfTokenHash: row.csrfTokenHash,
            idleExpiresAt,
            tokenHash,
        });
    });

    const invalidate = Effect.fn('Session.invalidate')(function* (
        token: string,
    ) {
        const tokenHash = yield* hashToken(token);
        yield* d1Store.run('DELETE FROM sessions WHERE token_hash = ?', [
            tokenHash,
        ]);
    });

    const invalidateAll = d1Store
        .run('DELETE FROM sessions')
        .pipe(Effect.asVoid, Effect.withSpan('Session.invalidateAll'));

    const verifyCsrf = Effect.fn('Session.verifyCsrf')(function* (
        session: AuthenticatedSession,
        token: string,
    ) {
        const hash = yield* hashToken(token);
        const persisted = yield* d1Store.first(
            SessionRow,
            `
                SELECT
                    token_hash AS "tokenHash",
                    csrf_token_hash AS "csrfTokenHash",
                    idle_expires_at AS "idleExpiresAt",
                    absolute_expires_at AS "absoluteExpiresAt"
                FROM sessions
                WHERE token_hash = ?
            `,
            [session.tokenHash],
        );
        return (
            persisted !== null &&
            hash === session.csrfTokenHash &&
            hash === persisted.csrfTokenHash
        );
    });

    return { authenticate, create, invalidate, invalidateAll, verifyCsrf };
}
