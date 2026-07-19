import { createRequestHandler, RouterContextProvider } from 'react-router';
import {
    appendClearedSessionCookies,
    requestSessionConstraint,
    resolveAuthentication,
} from '../app/auth/session.server';
import { makeRequestEffectRunner } from '../app/effect/runtime';
import { cloudflareRequestContext } from '../app/platform-context';
import { traceHttpRequest } from './observability';

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

                const response = await requestHandler(request, context);
                const headers = new Headers(response.headers);
                if (authentication.authenticated) {
                    headers.set('Cache-Control', 'private, no-store');
                } else if (authentication.clearInvalidCookies) {
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
