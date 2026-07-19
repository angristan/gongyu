import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Form, useRouteLoaderData } from 'react-router';
import { loadPhase0Status } from '../effect/phase0';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/home';

export function meta(): Route.MetaDescriptors {
    return [
        { title: 'Gongyu Cloudflare rewrite' },
        {
            name: 'description',
            content: 'Phase 0 runtime validation for Gongyu.',
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
        <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-8 px-6 py-16">
            <div className="space-y-3">
                <p className="text-sm font-medium text-kumo-subtle">
                    Phase 0 · {loaderData.environment}
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-kumo-default sm:text-5xl">
                    Gongyu on Cloudflare
                </h1>
                <p className="max-w-2xl text-lg text-kumo-subtle">
                    React Router SSR, Kumo, Effect, and a native D1 Session are
                    running together.
                </p>
            </div>

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

                    <Form method="post" action="/theme">
                        <input type="hidden" name="mode" value={nextMode} />
                        <input type="hidden" name="returnTo" value="/" />
                        <Button type="submit" variant="secondary">
                            Use {nextMode} mode
                        </Button>
                    </Form>
                </div>
            </LayerCard>
        </main>
    );
}
