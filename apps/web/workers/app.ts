import { createRequestHandler, RouterContextProvider } from 'react-router';
import {
    appendClearedSessionCookies,
    requestSessionConstraint,
    resolveAuthentication,
} from '../app/auth/session.server';
import { makeRequestEffectRunner } from '../app/effect/runtime';
import { cloudflareRequestContext } from '../app/platform-context';
import { traceHttpRequest } from './observability';

export { DataWorkflow } from '@gongyu/jobs/data-workflow';
export { Phase0Workflow } from '@gongyu/jobs/workflow';

const requestHandler = createRequestHandler(
    () => import('virtual:react-router/server-build'),
    import.meta.env.MODE,
);

export default {
    fetch(request, env, executionContext) {
        const requestId = crypto.randomUUID();
        const sessionConstraint = requestSessionConstraint(request);

        return traceHttpRequest({
            method: request.method,
            operation: async () => {
                const context = new RouterContextProvider();
                const effect = makeRequestEffectRunner({
                    bucket: env.UPLOADS,
                    database: env.DB,
                    encryptionKeyring: env.ENCRYPTION_KEYS,
                    requestId,
                    sessionConstraint,
                });
                const authentication = await resolveAuthentication(
                    effect,
                    request,
                );
                context.set(cloudflareRequestContext, {
                    authentication,
                    effect,
                    env,
                    executionContext,
                    requestId,
                });

                const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(
                    request.method,
                );
                const writeLeaseId = `request:${requestId}`;
                let hasWriteLease = false;
                if (authentication.authenticated && isMutation) {
                    const now = Date.now() * 1_000;
                    const result = await env.DB.withSession('first-primary')
                        .prepare(
                            `
                                INSERT INTO write_leases (id, expires_at)
                                SELECT ?, ?
                                WHERE NOT EXISTS (
                                    SELECT 1 FROM app_state WHERE read_only = 1
                                )
                            `,
                        )
                        .bind(writeLeaseId, now + 120 * 1_000_000)
                        .run();
                    hasWriteLease = result.meta.changes === 1;
                }

                let response: Response;
                try {
                    response = await requestHandler(request, context);
                } finally {
                    if (hasWriteLease) {
                        await env.DB.withSession('first-primary')
                            .prepare('DELETE FROM write_leases WHERE id = ?')
                            .bind(writeLeaseId)
                            .run();
                    }
                }
                const headers = new Headers(response.headers);
                if (!headers.has('Cache-Control')) {
                    headers.set('Cache-Control', 'private, no-store');
                }
                headers.set(
                    'Content-Security-Policy',
                    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
                );
                headers.set(
                    'Permissions-Policy',
                    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
                );
                headers.set(
                    'Referrer-Policy',
                    'strict-origin-when-cross-origin',
                );
                headers.set('X-Content-Type-Options', 'nosniff');
                headers.set('X-Frame-Options', 'DENY');
                if (new URL(request.url).protocol === 'https:') {
                    headers.set(
                        'Strict-Transport-Security',
                        'max-age=31536000',
                    );
                }
                if (
                    !authentication.authenticated &&
                    authentication.clearInvalidCookies
                ) {
                    appendClearedSessionCookies(headers);
                }
                return new Response(response.body, {
                    headers,
                    status: response.status,
                    statusText: response.statusText,
                });
            },
            requestId,
            sessionConstraint,
        });
    },
} satisfies ExportedHandler<Env>;
