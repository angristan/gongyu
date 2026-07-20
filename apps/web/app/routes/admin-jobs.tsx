import { Banner } from '@cloudflare/kumo/components/banner';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Empty } from '@cloudflare/kumo/components/empty';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Table } from '@cloudflare/kumo/components/table';
import { cn } from '@cloudflare/kumo/utils';
import { WorkRepository } from '@gongyu/data/work-repository';
import {
    ArrowClockwiseIcon,
    CheckCircleIcon,
    QueueIcon,
    WarningIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import {
    data,
    Form,
    Link,
    redirect,
    useNavigation,
    useRouteLoaderData,
} from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { AdminPage } from '../components/admin-page';
import { StatusBadge } from '../components/status-badge';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-jobs';

const filters = ['all', 'active', 'failed', 'completed'] as const;
type JobFilter = (typeof filters)[number];

function parseFilter(value: string | null): JobFilter {
    return filters.find((filter) => filter === value) ?? 'all';
}

function included(state: string, filter: JobFilter): boolean {
    if (filter === 'active') {
        return [
            'queued',
            'processing',
            'retrying',
            'waiting_metadata',
        ].includes(state);
    }
    if (filter === 'failed') {
        return ['failed', 'needs_review'].includes(state);
    }
    if (filter === 'completed') {
        return ['completed', 'delivered'].includes(state);
    }
    return true;
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Background work · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const url = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(`/login?returnTo=${encodeURIComponent(url.pathname)}`);
    }
    const jobs = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* WorkRepository;
            return yield* repository.listJobs(100);
        }),
    );
    const filter = parseFilter(url.searchParams.get('state'));
    return {
        filter,
        jobs: jobs.filter((job) => included(job.state, filter)),
        summary: {
            active: jobs.filter((job) => included(job.state, 'active')).length,
            completed: jobs.filter((job) => included(job.state, 'completed'))
                .length,
            failed: jobs.filter((job) => included(job.state, 'failed')).length,
            total: jobs.length,
        },
        updated: url.searchParams.get('updated'),
    };
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
        requireWritable: true,
        runner: effect,
    });
    const formData = await request.formData();
    const jobId = formData.get('job_id');
    const intent = formData.get('intent');
    if (typeof jobId !== 'string' || jobId === '') {
        return data({ error: 'Select a job.' }, { status: 400 });
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
        return data(
            { error: 'This job is not recoverable from its current state.' },
            { status: 409 },
        );
    }
    return redirect(
        `/admin/jobs?updated=${intent === 'mark_delivered' ? 'delivered' : 'retried'}`,
    );
}

function TwitterReviewChoices({
    csrfToken,
    jobId,
    processing,
}: {
    readonly csrfToken: string;
    readonly jobId: string;
    readonly processing: boolean;
}) {
    return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Form method="post">
                <input name="_csrf" type="hidden" value={csrfToken} />
                <input name="job_id" type="hidden" value={jobId} />
                <input name="intent" type="hidden" value="mark_delivered" />
                <Button
                    className="w-full"
                    icon={CheckCircleIcon}
                    loading={processing}
                    type="submit"
                    variant="secondary"
                >
                    Mark delivered
                </Button>
            </Form>
            <Form method="post">
                <input name="_csrf" type="hidden" value={csrfToken} />
                <input name="job_id" type="hidden" value={jobId} />
                <input name="intent" type="hidden" value="retry" />
                <Button
                    className="w-full"
                    icon={ArrowClockwiseIcon}
                    loading={processing}
                    type="submit"
                    variant="primary"
                >
                    Retry despite risk
                </Button>
            </Form>
        </div>
    );
}

function RecoveryActions({
    csrfToken,
    job,
    processing,
}: {
    readonly csrfToken: string;
    readonly job: {
        readonly id: string;
        readonly state: string;
    };
    readonly processing: boolean;
}) {
    if (job.state === 'needs_review') {
        return (
            <>
                <Dialog.Root role="alertdialog">
                    <Dialog.Trigger
                        render={
                            <Button
                                icon={WarningIcon}
                                size="sm"
                                variant="secondary"
                            />
                        }
                    >
                        Review
                    </Dialog.Trigger>
                    <Dialog className="space-y-5 p-6" size="lg">
                        <div className="space-y-2">
                            <Dialog.Title>
                                Ambiguous Twitter delivery
                            </Dialog.Title>
                            <Dialog.Description>
                                Twitter may have accepted this post before the
                                request failed. Retrying can create a duplicate.
                            </Dialog.Description>
                        </div>
                        <TwitterReviewChoices
                            csrfToken={csrfToken}
                            jobId={job.id}
                            processing={processing}
                        />
                    </Dialog>
                </Dialog.Root>
                <noscript>
                    <div className="space-y-3 rounded-xl border border-kumo-line bg-kumo-tint/40 p-4">
                        <p className="text-sm leading-6 text-kumo-default">
                            Twitter may have accepted this post. Choose whether
                            to mark it delivered or retry despite duplicate
                            risk.
                        </p>
                        <TwitterReviewChoices
                            csrfToken={csrfToken}
                            jobId={job.id}
                            processing={false}
                        />
                    </div>
                </noscript>
            </>
        );
    }
    return (
        <Form method="post">
            <input name="_csrf" type="hidden" value={csrfToken} />
            <input name="job_id" type="hidden" value={job.id} />
            <input name="intent" type="hidden" value="retry" />
            <Button
                icon={ArrowClockwiseIcon}
                loading={processing}
                size="sm"
                type="submit"
                variant="secondary"
            >
                Retry
            </Button>
        </Form>
    );
}

export default function AdminJobs({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const processing = useNavigation().state !== 'idle';
    return (
        <AdminPage
            description="Inspect durable metadata, thumbnail, and social delivery work."
            section="Background work"
            title="Background work"
        >
            {actionData?.error === undefined ? null : (
                <Banner
                    description={actionData.error}
                    title="The job could not be updated"
                    variant="error"
                />
            )}
            {loaderData.updated === null ? null : (
                <Banner
                    description={
                        loaderData.updated === 'delivered'
                            ? 'The ambiguous delivery was resolved without another provider request.'
                            : 'The job is queued for another attempt.'
                    }
                    title="Job updated"
                    variant="secondary"
                />
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    ['All', loaderData.summary.total, 'all'],
                    ['Active', loaderData.summary.active, 'active'],
                    ['Needs attention', loaderData.summary.failed, 'failed'],
                    ['Completed', loaderData.summary.completed, 'completed'],
                ].map(([label, count, value]) => (
                    <Link
                        aria-current={
                            loaderData.filter === value ? 'page' : undefined
                        }
                        className={cn(
                            'rounded-xl border p-4',
                            loaderData.filter === value
                                ? 'border-kumo-brand bg-kumo-tint shadow-sm'
                                : 'border-kumo-line bg-kumo-base hover:border-kumo-brand/40',
                        )}
                        key={value}
                        to={
                            value === 'all'
                                ? '/admin/jobs'
                                : `/admin/jobs?state=${value}`
                        }
                    >
                        <span className="block text-xs font-medium text-kumo-subtle">
                            {label}
                        </span>
                        <strong className="mt-1 block text-2xl text-kumo-default">
                            {count}
                        </strong>
                    </Link>
                ))}
            </div>

            <LayerCard className="overflow-hidden">
                {loaderData.jobs.length === 0 ? (
                    <Empty
                        description="Background activity matching this filter will appear here."
                        icon={
                            <QueueIcon
                                aria-hidden="true"
                                size={42}
                                weight="duotone"
                            />
                        }
                        title="No background work"
                    />
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head>Job</Table.Head>
                                        <Table.Head>Status</Table.Head>
                                        <Table.Head>Attempts</Table.Head>
                                        <Table.Head>Updated</Table.Head>
                                        <Table.Head className="text-right">
                                            Recovery
                                        </Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {loaderData.jobs.map((job) => (
                                        <Table.Row key={job.id}>
                                            <Table.Cell>
                                                <div>
                                                    <p className="font-medium text-kumo-default">
                                                        {job.kind.replace(
                                                            ':',
                                                            ' · ',
                                                        )}
                                                    </p>
                                                    <Link
                                                        className="text-xs text-kumo-link"
                                                        to={`/b/${job.bookmarkShortUrl}`}
                                                    >
                                                        {job.bookmarkShortUrl}
                                                    </Link>
                                                    {job.lastErrorCode ===
                                                    null ? null : (
                                                        <p className="mt-1 font-mono text-xs text-kumo-danger">
                                                            {job.lastErrorCode}
                                                        </p>
                                                    )}
                                                </div>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <StatusBadge
                                                    state={job.state}
                                                />
                                            </Table.Cell>
                                            <Table.Cell>
                                                {job.attempts}
                                            </Table.Cell>
                                            <Table.Cell className="whitespace-nowrap text-sm text-kumo-subtle">
                                                {formatDate(job.updatedAt)}
                                            </Table.Cell>
                                            <Table.Cell>
                                                <div className="flex justify-end">
                                                    {job.recoverable === 1 &&
                                                    [
                                                        'failed',
                                                        'needs_review',
                                                    ].includes(job.state) ? (
                                                        <RecoveryActions
                                                            csrfToken={
                                                                csrfToken
                                                            }
                                                            job={job}
                                                            processing={
                                                                processing
                                                            }
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-kumo-subtle">
                                                            —
                                                        </span>
                                                    )}
                                                </div>
                                            </Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </div>
                        <ol className="divide-y divide-kumo-line md:hidden">
                            {loaderData.jobs.map((job) => (
                                <li className="space-y-3 p-4" key={job.id}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-kumo-default">
                                                {job.kind.replace(':', ' · ')}
                                            </p>
                                            <p className="mt-1 text-xs text-kumo-subtle">
                                                {formatDate(job.updatedAt)} ·
                                                attempt {job.attempts}
                                            </p>
                                        </div>
                                        <StatusBadge state={job.state} />
                                    </div>
                                    {job.lastErrorCode === null ? null : (
                                        <p className="font-mono text-xs text-kumo-danger">
                                            {job.lastErrorCode}
                                        </p>
                                    )}
                                    {job.recoverable === 1 &&
                                    ['failed', 'needs_review'].includes(
                                        job.state,
                                    ) ? (
                                        <RecoveryActions
                                            csrfToken={csrfToken}
                                            job={job}
                                            processing={processing}
                                        />
                                    ) : null}
                                </li>
                            ))}
                        </ol>
                    </>
                )}
            </LayerCard>
        </AdminPage>
    );
}
