import { createRequestHandler, RouterContextProvider } from 'react-router';
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
        const context = new RouterContextProvider();
        const requestId = crypto.randomUUID();
        const sessionConstraint =
            request.method === 'GET' || request.method === 'HEAD'
                ? 'first-unconstrained'
                : 'first-primary';
        context.set(cloudflareRequestContext, {
            effect: makeRequestEffectRunner({
                bucket: env.UPLOADS,
                database: env.DB,
                requestId,
                sessionConstraint,
            }),
            env,
            executionContext,
            requestId,
        });

        return traceHttpRequest({
            method: request.method,
            operation: () => requestHandler(request, context),
            requestId,
            sessionConstraint,
        });
    },
} satisfies ExportedHandler<Env>;
