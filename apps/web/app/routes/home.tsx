import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { PageShell } from '@gongyu/ui/page-shell';
import { Form, Link, useRouteLoaderData } from 'react-router';
import { loadPhase0Status } from '../effect/phase0';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/home';

export function meta(): Route.MetaDescriptors {
    return [
        { title: 'Gongyu Cloudflare rewrite' },
        {
            name: 'description',
            content: 'Cloudflare platform foundation for Gongyu.',
        },
    ];
}

export async function loader({ context }: Route.LoaderArgs) {
    const { effect, env, requestId } = context.get(cloudflareRequestContext);
    const status = await effect.runPromise(loadPhase0Status());

    return {
        environment: env.APP_ENV,
        requestId,
        ...status,
    };
}

export default function Home({ loaderData }: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const currentMode = rootData?.themeMode ?? 'light';
    const nextMode = currentMode === 'light' ? 'dark' : 'light';

    return (
        <PageShell
            description="React Router SSR, Kumo, Effect, and native Cloudflare services are running through explicit runtime boundaries."
            eyebrow={`Phase 1 · ${loaderData.environment}`}
            title="Gongyu on Cloudflare"
            width="wide"
        >
            <LayerCard className="max-w-2xl">
                <div className="space-y-4 p-6">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-kumo-subtle">Database</dt>
                            <dd className="font-medium text-kumo-default">
                                {loaderData.databaseReady
                                    ? 'ready'
                                    : 'unavailable'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-kumo-subtle">D1 Session</dt>
                            <dd className="font-medium text-kumo-default">
                                {loaderData.sessionConstraint}
                            </dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-kumo-subtle">
                                Request identifier
                            </dt>
                            <dd>
                                <code className="text-kumo-default">
                                    {loaderData.requestId}
                                </code>
                            </dd>
                        </div>
                    </dl>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            className="text-sm font-medium text-kumo-link"
                            to="/passkey"
                        >
                            Open passkey spike
                        </Link>
                        <Link
                            className="text-sm font-medium text-kumo-link"
                            to="/storage"
                        >
                            Open storage spike
                        </Link>
                    </div>

                    <Form method="post" action="/theme">
                        <input type="hidden" name="mode" value={nextMode} />
                        <input type="hidden" name="returnTo" value="/" />
                        <Button type="submit" variant="secondary">
                            Use {nextMode} mode
                        </Button>
                    </Form>
                </div>
            </LayerCard>
        </PageShell>
    );
}
