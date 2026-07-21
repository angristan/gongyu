import { PreviewBackfillRepository } from '@gongyu/data/preview-backfill-repository';
import { WorkRepository } from '@gongyu/data/work-repository';
import {
    ArrowClockwiseIcon,
    CheckCircleIcon,
    QueueIcon,
    WarningIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { useEffect } from 'react';
import {
    data,
    Form,
    Link,
    redirect,
    useNavigation,
    useRevalidator,
    useRouteLoaderData,
} from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { AdminPage } from '../components/admin-page';
import { PreviewBackfillPanel } from '../components/preview-backfill-panel';
import { StatusBadge } from '../components/status-badge';
import {
    Banner,
    Button,
    cn,
    Dialog,
    Empty,
    HydratedOnly,
    LayerCard,
} from '../components/ui';
import { matchesFormSubmission, submittedFormValue } from '../form-navigation';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-jobs';

const filters = ['all', 'active', 'failed', 'completed'] as const;
const PREVIEW_BACKFILL_ITEM_LIMIT = 10_000;
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
    const { backfill, jobs } = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* WorkRepository;
            const previewBackfill = yield* PreviewBackfillRepository;
            return {
                backfill: yield* previewBackfill.getSummary,
                jobs: yield* repository.listJobs(100),
            };
        }),
    );
    const filter = parseFilter(url.searchParams.get('state'));
    return {
        backfill,
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
    const intent = formData.get('intent');
    if (
        intent === 'start_preview_backfill' ||
        intent === 'pause_preview_backfill' ||
        intent === 'resume_preview_backfill'
    ) {
        const runId = formData.get('run_id');
        if (
            intent !== 'start_preview_backfill' &&
            (typeof runId !== 'string' || runId === '')
        ) {
            return data(
                { error: 'Select a preview backfill.' },
                { status: 400 },
            );
        }
        const changed = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* PreviewBackfillRepository;
                const now = Date.now() * 1_000;
                if (intent === 'start_preview_backfill') {
                    return yield* repository.start({
                        itemLimit: PREVIEW_BACKFILL_ITEM_LIMIT,
                        now,
                        runId: crypto.randomUUID(),
                    });
                }
                if (typeof runId !== 'string') {
                    return false;
                }
                return intent === 'pause_preview_backfill'
                    ? yield* repository.pause(runId, now)
                    : yield* repository.resume(runId, now);
            }),
        );
        if (!changed) {
            return data(
                {
                    error: 'The preview backfill changed state. Refresh and try again.',
                },
                { status: 409 },
            );
        }
        const updated =
            intent === 'start_preview_backfill'
                ? 'backfill_started'
                : intent === 'pause_preview_backfill'
                  ? 'backfill_paused'
                  : 'backfill_resumed';
        return redirect(`/admin/jobs?updated=${updated}`);
    }

    const jobId = formData.get('job_id');
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
    disabled,
    jobId,
    pendingIntent,
}: {
    readonly csrfToken: string;
    readonly disabled: boolean;
    readonly jobId: string;
    readonly pendingIntent: string | null;
}) {
    return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Form method="post">
                <input name="_csrf" type="hidden" value={csrfToken} />
                <input name="job_id" type="hidden" value={jobId} />
                <input name="intent" type="hidden" value="mark_delivered" />
                <Button
                    className="w-full"
                    disabled={disabled}
                    icon={CheckCircleIcon}
                    loading={pendingIntent === 'mark_delivered'}
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
                    disabled={disabled}
                    icon={ArrowClockwiseIcon}
                    loading={pendingIntent === 'retry'}
                    type="submit"
                    variant="destructive"
                >
                    Retry despite risk
                </Button>
            </Form>
        </div>
    );
}

function RecoveryActions({
    csrfToken,
    disabled,
    job,
    pendingIntent,
    pendingJobId,
}: {
    readonly csrfToken: string;
    readonly disabled: boolean;
    readonly job: {
        readonly id: string;
        readonly state: string;
    };
    readonly pendingIntent: string | null;
    readonly pendingJobId: string | null;
}) {
    const processingIntent = pendingJobId === job.id ? pendingIntent : null;
    if (job.state === 'needs_review') {
        return (
            <>
                <HydratedOnly>
                    <Dialog.Root role="alertdialog">
                        <Dialog.Trigger
                            render={
                                <Button
                                    disabled={disabled}
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
                                    Twitter may have accepted this post before
                                    the request failed. Retrying can create a
                                    duplicate.
                                </Dialog.Description>
                            </div>
                            <TwitterReviewChoices
                                csrfToken={csrfToken}
                                disabled={disabled}
                                jobId={job.id}
                                pendingIntent={processingIntent}
                            />
                        </Dialog>
                    </Dialog.Root>
                </HydratedOnly>
                <noscript>
                    <div className="space-y-3 rounded-lg border border-gongyu-line p-3">
                        <p className="text-sm leading-6 text-gongyu-default">
                            Twitter may have accepted this post. Choose whether
                            to mark it delivered or retry despite duplicate
                            risk.
                        </p>
                        <TwitterReviewChoices
                            csrfToken={csrfToken}
                            disabled={false}
                            jobId={job.id}
                            pendingIntent={null}
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
                disabled={disabled}
                icon={ArrowClockwiseIcon}
                loading={processingIntent === 'retry'}
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
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const pendingJobId = submittedFormValue(
        navigation,
        { action: '/admin/jobs', method: 'POST' },
        'job_id',
    );
    const pendingIntent = submittedFormValue(
        navigation,
        { action: '/admin/jobs', method: 'POST' },
        'intent',
    );
    const isSubmitting = matchesFormSubmission(navigation, {
        action: '/admin/jobs',
        method: 'POST',
    });
    const backfillIsActive = ['running', 'paused'].includes(
        loaderData.backfill.state,
    );
    useEffect(() => {
        if (!backfillIsActive) {
            return;
        }
        const refresh = () => {
            if (
                document.visibilityState === 'visible' &&
                revalidator.state === 'idle'
            ) {
                revalidator.revalidate();
            }
        };
        const interval = window.setInterval(refresh, 10_000);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [backfillIsActive, revalidator]);
    return (
        <AdminPage
            description="Review metadata, thumbnail, and social sharing jobs."
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
                            : loaderData.updated === 'backfill_started'
                              ? 'The preview backfill is running newest-first with bounded admission.'
                              : loaderData.updated === 'backfill_paused'
                                ? 'New preview work is paused. Already queued items may finish.'
                                : loaderData.updated === 'backfill_resumed'
                                  ? 'The preview backfill is admitting new work again.'
                                  : 'The job is queued for another attempt.'
                    }
                    title={
                        loaderData.updated.startsWith('backfill_')
                            ? 'Preview backfill updated'
                            : 'Job updated'
                    }
                    variant="secondary"
                />
            )}

            <PreviewBackfillPanel
                csrfToken={csrfToken}
                pendingIntent={isSubmitting ? pendingIntent : null}
                summary={loaderData.backfill}
            />

            <LayerCard className="overflow-hidden">
                <nav
                    aria-label="Background work filters"
                    className="flex gap-1 overflow-x-auto border-b border-gongyu-line"
                >
                    {[
                        ['All', loaderData.summary.total, 'all'],
                        ['Active', loaderData.summary.active, 'active'],
                        [
                            'Needs attention',
                            loaderData.summary.failed,
                            'failed',
                        ],
                        [
                            'Completed',
                            loaderData.summary.completed,
                            'completed',
                        ],
                    ].map(([label, count, value]) => (
                        <Link
                            aria-current={
                                loaderData.filter === value ? 'page' : undefined
                            }
                            className={cn(
                                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm',
                                loaderData.filter === value
                                    ? 'border-gongyu-brand font-medium text-gongyu-default'
                                    : 'border-transparent text-gongyu-subtle hover:text-gongyu-default',
                            )}
                            key={value}
                            to={
                                value === 'all'
                                    ? '/admin/jobs'
                                    : `/admin/jobs?state=${value}`
                            }
                        >
                            {label}
                            <span className="rounded-full bg-gongyu-tint px-1.5 py-0.5 text-xs tabular-nums">
                                {count}
                            </span>
                        </Link>
                    ))}
                </nav>

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
                        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_4rem_9rem_8rem] gap-3 bg-gongyu-tint/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gongyu-subtle md:grid">
                            <span>Job</span>
                            <span>Status</span>
                            <span>Tries</span>
                            <span>Updated</span>
                            <span className="text-right">Recovery</span>
                        </div>
                        <ol className="hidden divide-y divide-gongyu-line md:block">
                            {loaderData.jobs.map((job) => (
                                <li
                                    className="grid grid-cols-[minmax(0,1fr)_7rem_4rem_9rem_8rem] items-center gap-3 px-3 py-2"
                                    key={job.id}
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-gongyu-default">
                                            {job.kind.replace(':', ' · ')}
                                        </p>
                                        <Link
                                            className="text-xs text-gongyu-link"
                                            to={`/b/${job.bookmarkShortUrl}`}
                                        >
                                            {job.bookmarkShortUrl}
                                        </Link>
                                        {job.lastErrorCode === null ? null : (
                                            <p className="mt-0.5 truncate font-mono text-xs text-gongyu-danger">
                                                {job.lastErrorCode}
                                            </p>
                                        )}
                                    </div>
                                    <StatusBadge state={job.state} />
                                    <span className="text-sm tabular-nums text-gongyu-subtle">
                                        {job.attempts}
                                    </span>
                                    <time className="whitespace-nowrap text-xs text-gongyu-subtle">
                                        {formatDate(job.updatedAt)}
                                    </time>
                                    <div className="flex justify-end">
                                        {job.recoverable === 1 &&
                                        ['failed', 'needs_review'].includes(
                                            job.state,
                                        ) ? (
                                            <RecoveryActions
                                                csrfToken={csrfToken}
                                                disabled={
                                                    pendingJobId === job.id
                                                }
                                                job={job}
                                                pendingIntent={pendingIntent}
                                                pendingJobId={pendingJobId}
                                            />
                                        ) : (
                                            <span className="text-xs text-gongyu-subtle">
                                                —
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                        <ol className="divide-y divide-gongyu-line md:hidden">
                            {loaderData.jobs.map((job) => (
                                <li className="space-y-3 p-3" key={job.id}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-gongyu-default">
                                                {job.kind.replace(':', ' · ')}
                                            </p>
                                            <p className="mt-1 text-xs text-gongyu-subtle">
                                                {formatDate(job.updatedAt)} ·
                                                attempt {job.attempts}
                                            </p>
                                        </div>
                                        <StatusBadge state={job.state} />
                                    </div>
                                    {job.lastErrorCode === null ? null : (
                                        <p className="font-mono text-xs text-gongyu-danger">
                                            {job.lastErrorCode}
                                        </p>
                                    )}
                                    {job.recoverable === 1 &&
                                    ['failed', 'needs_review'].includes(
                                        job.state,
                                    ) ? (
                                        <RecoveryActions
                                            csrfToken={csrfToken}
                                            disabled={pendingJobId === job.id}
                                            job={job}
                                            pendingIntent={pendingIntent}
                                            pendingJobId={pendingJobId}
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
