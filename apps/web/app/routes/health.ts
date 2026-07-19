import { HealthResponse } from '@gongyu/domain/health';
import { loadPhase0Status } from '../effect/phase0';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/health';

const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
};

export async function loader({ context }: Route.LoaderArgs) {
    const { effect, env, requestId } = context.get(cloudflareRequestContext);

    try {
        const status = await effect.runPromise(loadPhase0Status());
        const isHealthy = status.databaseReady;
        return Response.json(
            HealthResponse.make({
                databaseReady: status.databaseReady,
                environment: env.APP_ENV,
                requestId,
                sessionConstraint: status.sessionConstraint,
                status: isHealthy ? 'ok' : 'degraded',
            }),
            {
                headers: { ...headers, 'X-Request-ID': requestId },
                status: isHealthy ? 200 : 503,
            },
        );
    } catch {
        return Response.json(
            HealthResponse.make({
                databaseReady: false,
                environment: env.APP_ENV,
                requestId,
                sessionConstraint: 'first-unconstrained',
                status: 'degraded',
            }),
            {
                headers: { ...headers, 'X-Request-ID': requestId },
                status: 503,
            },
        );
    }
}
