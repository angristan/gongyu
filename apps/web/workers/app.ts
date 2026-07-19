import { createRequestHandler, RouterContextProvider } from 'react-router';
import { makeRequestEffectRunner } from '../app/effect/runtime';
import { cloudflareRequestContext } from '../app/platform-context';

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
                database: env.DB,
                requestId,
                sessionConstraint,
            }),
            env,
            executionContext,
            requestId,
        });

        return requestHandler(request, context);
    },
} satisfies ExportedHandler<Env>;
