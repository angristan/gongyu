import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { WorkRepository } from '@gongyu/data/work-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { Form, Link, redirect, useRouteLoaderData } from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-jobs';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Jobs · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    if (!authentication.authenticated) {
        const url = new URL(request.url);
        return redirect(`/login?returnTo=${encodeURIComponent(url.pathname)}`);
    }
    const jobs = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* WorkRepository;
            return yield* repository.listJobs(100);
        }),
    );
    return { jobs };
}

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        runner: effect,
    });
    const formData = await request.formData();
    const jobId = formData.get('job_id');
    const intent = formData.get('intent');
    if (typeof jobId !== 'string' || jobId === '') {
        return Response.json({ error: 'Select a job.' }, { status: 400 });
    }
    const changed = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* WorkRepository;
            const now = Date.now() * 1_000;
            return intent === 'mark_delivered'
                ? yield* repository.resolveReviewedTwitter(jobId, now)
                : yield* repository.retryJob(jobId, now);
        }),
    );
    if (!changed) {
        return Response.json(
            { error: 'This job is not recoverable from its current state.' },
            { status: 409 },
        );
    }
    return redirect('/admin/jobs');
}

export default function AdminJobs({ loaderData }: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    return (
        <PageShell
            description="Inspect durable background work and explicitly retry terminal failures."
            eyebrow="Administrator"
            footer={
                <Link className="text-kumo-link" to="/admin/dashboard">
                    Back to dashboard
                </Link>
            }
            title="Background jobs"
        >
            {loaderData.jobs.length === 0 ? (
                <LayerCard>
                    <p className="p-6 text-kumo-subtle">
                        No background jobs have run yet.
                    </p>
                </LayerCard>
            ) : (
                <div className="space-y-3">
                    {loaderData.jobs.map((job) => (
                        <LayerCard key={job.id}>
                            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                                <div className="min-w-0 space-y-1">
                                    <p className="font-medium text-kumo-default">
                                        {job.kind} · {job.bookmarkShortUrl}
                                    </p>
                                    <p className="break-all text-sm text-kumo-subtle">
                                        {job.state} · attempt {job.attempts}
                                        {job.lastErrorCode === null
                                            ? ''
                                            : ` · ${job.lastErrorCode}`}
                                    </p>
                                </div>
                                {job.recoverable === 1 &&
                                ['failed', 'needs_review'].includes(
                                    job.state,
                                ) ? (
                                    <div className="flex flex-wrap gap-2">
                                        <Form method="post">
                                            <input
                                                name="_csrf"
                                                type="hidden"
                                                value={csrfToken}
                                            />
                                            <input
                                                name="job_id"
                                                type="hidden"
                                                value={job.id}
                                            />
                                            <input
                                                name="intent"
                                                type="hidden"
                                                value="retry"
                                            />
                                            <Button type="submit">
                                                {job.state === 'needs_review'
                                                    ? 'Retry despite duplicate risk'
                                                    : 'Retry'}
                                            </Button>
                                        </Form>
                                        {job.state === 'needs_review' ? (
                                            <Form method="post">
                                                <input
                                                    name="_csrf"
                                                    type="hidden"
                                                    value={csrfToken}
                                                />
                                                <input
                                                    name="job_id"
                                                    type="hidden"
                                                    value={job.id}
                                                />
                                                <input
                                                    name="intent"
                                                    type="hidden"
                                                    value="mark_delivered"
                                                />
                                                <Button
                                                    type="submit"
                                                    variant="secondary"
                                                >
                                                    Mark delivered
                                                </Button>
                                            </Form>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </LayerCard>
                    ))}
                </div>
            )}
        </PageShell>
    );
}
