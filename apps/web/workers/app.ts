import { createRequestHandler, RouterContextProvider } from 'react-router';
import { cloudflareRequestContext } from '../app/platform-context';

const requestHandler = createRequestHandler(
    () => import('virtual:react-router/server-build'),
    import.meta.env.MODE,
);

export default {
    fetch(request, env, executionContext) {
        const context = new RouterContextProvider();
        context.set(cloudflareRequestContext, {
            env,
            executionContext,
            requestId: crypto.randomUUID(),
        });

        return requestHandler(request, context);
    },
} satisfies ExportedHandler<Env>;
