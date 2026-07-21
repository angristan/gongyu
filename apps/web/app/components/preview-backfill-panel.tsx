import type { PreviewBackfillSummary } from '@gongyu/data/preview-backfill-repository';
import { ImageSquareIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { Form, Link } from 'react-router';
import { AdminPanelHeader, adminPanelBodyClass } from './admin-panel';
import { OperationProgress } from './operation-progress';
import { StatusBadge } from './status-badge';
import { Button, LayerCard } from './ui';

function formatCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function BackfillAction({
    children,
    csrfToken,
    disabled,
    icon,
    intent,
    loading,
    runId,
}: {
    readonly children: string;
    readonly csrfToken: string;
    readonly disabled: boolean;
    readonly icon: typeof PlayIcon;
    readonly intent: string;
    readonly loading: boolean;
    readonly runId?: string;
}) {
    return (
        <Form method="post">
            <input name="_csrf" type="hidden" value={csrfToken} />
            <input name="intent" type="hidden" value={intent} />
            {runId === undefined ? null : (
                <input name="run_id" type="hidden" value={runId} />
            )}
            <Button
                disabled={disabled}
                icon={icon}
                loading={loading}
                size="sm"
                type="submit"
                variant={
                    intent === 'start_preview_backfill'
                        ? 'primary'
                        : 'secondary'
                }
            >
                {children}
            </Button>
        </Form>
    );
}

export function PreviewBackfillPanel({
    csrfToken,
    pendingIntent,
    summary,
}: {
    readonly csrfToken: string;
    readonly pendingIntent: string | null;
    readonly summary: PreviewBackfillSummary;
}) {
    const processed =
        summary.previewed +
        summary.noPreview +
        summary.failed +
        summary.skipped;
    const active = summary.state === 'running' || summary.state === 'paused';
    const disabled = pendingIntent !== null;
    let action = null;
    if (summary.state === 'running' && summary.id !== null) {
        action = (
            <BackfillAction
                csrfToken={csrfToken}
                disabled={disabled}
                icon={PauseIcon}
                intent="pause_preview_backfill"
                loading={pendingIntent === 'pause_preview_backfill'}
                runId={summary.id}
            >
                Pause
            </BackfillAction>
        );
    } else if (summary.state === 'paused' && summary.id !== null) {
        action = (
            <BackfillAction
                csrfToken={csrfToken}
                disabled={disabled}
                icon={PlayIcon}
                intent="resume_preview_backfill"
                loading={pendingIntent === 'resume_preview_backfill'}
                runId={summary.id}
            >
                Resume
            </BackfillAction>
        );
    } else {
        action = (
            <BackfillAction
                csrfToken={csrfToken}
                disabled={disabled || summary.candidateCount === 0}
                icon={PlayIcon}
                intent="start_preview_backfill"
                loading={pendingIntent === 'start_preview_backfill'}
            >
                {summary.state === 'completed'
                    ? 'Start another pass'
                    : 'Start preview backfill'}
            </BackfillAction>
        );
    }

    return (
        <section aria-labelledby="preview-backfill-heading">
            <LayerCard>
                <AdminPanelHeader
                    actions={action}
                    description={
                        <>
                            Discover and mirror safe preview images
                            newest-first. Admission is limited to 5 bookmarks
                            per minute and 10 active jobs.
                        </>
                    }
                    icon={<ImageSquareIcon aria-hidden="true" size={18} />}
                    title={
                        <span className="flex items-center gap-2">
                            <span id="preview-backfill-heading">
                                Preview backfill
                            </span>
                            <StatusBadge state={summary.state} />
                        </span>
                    }
                />
                <div className={adminPanelBodyClass}>
                    {summary.id === null ? (
                        <p className="text-sm leading-6 text-gongyu-subtle">
                            {formatCount(summary.candidateCount)} bookmarks do
                            not have a mirrored preview. Nothing runs until you
                            start a backfill.
                        </p>
                    ) : (
                        <>
                            <OperationProgress
                                label="Previews processed"
                                processed={processed}
                                total={summary.total}
                            />
                            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                                {[
                                    ['Mirrored', summary.previewed],
                                    ['No image', summary.noPreview],
                                    ['Failed', summary.failed],
                                    ['Skipped', summary.skipped],
                                    [
                                        'Remaining',
                                        summary.pending + summary.queued,
                                    ],
                                ].map(([label, value]) => (
                                    <div
                                        className="rounded-lg bg-gongyu-tint/45 px-3 py-2"
                                        key={label}
                                    >
                                        <dt className="text-xs text-gongyu-subtle">
                                            {label}
                                        </dt>
                                        <dd className="mt-0.5 font-semibold tabular-nums text-gongyu-default">
                                            {formatCount(Number(value))}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </>
                    )}
                    {active ? (
                        <p className="text-xs leading-5 text-gongyu-subtle">
                            Pausing stops new admission; already queued previews
                            may finish.
                        </p>
                    ) : null}
                    <noscript>
                        <Link
                            className="text-sm font-medium text-gongyu-link hover:underline"
                            to="/admin/jobs"
                        >
                            Refresh status
                        </Link>
                    </noscript>
                </div>
            </LayerCard>
        </section>
    );
}
