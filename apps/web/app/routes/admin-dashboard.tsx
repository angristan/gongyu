import { DashboardRepository } from '@gongyu/data/dashboard-repository';
import type {
    DashboardPeriod,
    DashboardTrendGranularity,
    DashboardTrendPoint,
} from '@gongyu/domain/dashboard';
import {
    BookmarkSimpleIcon,
    CalendarDotsIcon,
    ChartLineUpIcon,
    PlusIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { Link, redirect } from 'react-router';
import { AdminPage } from '../components/admin-page';
import { cn, Empty, LayerCard, LinkButton } from '../components/ui';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/admin-dashboard';

const periods: ReadonlyArray<{
    readonly label: string;
    readonly value: DashboardPeriod;
}> = [
    { label: '7 days', value: '7d' },
    { label: '30 days', value: '30d' },
    { label: '90 days', value: '90d' },
    { label: '1 year', value: '1y' },
    { label: 'All time', value: 'all' },
];

function parsePeriod(value: string | null): DashboardPeriod {
    return periods.find((period) => period.value === value)?.value ?? '30d';
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

const granularityLabels: Record<DashboardTrendGranularity, string> = {
    day: 'Daily',
    month: 'Monthly',
    quarter: 'Quarterly',
    week: 'Weekly',
};

function ActivityChart({
    granularity,
    points,
}: {
    readonly granularity: DashboardTrendGranularity;
    readonly points: ReadonlyArray<DashboardTrendPoint>;
}) {
    const maximum = Math.max(1, ...points.map((point) => point.count));
    const midpoint = Math.ceil(maximum / 2);
    const firstLabel = points[0]?.date ?? '';
    const middleLabel = points[Math.floor(points.length / 2)]?.date ?? '';
    const lastLabel = points.at(-1)?.date ?? '';
    const total = points.reduce((sum, point) => sum + point.count, 0);

    return (
        <div className="mt-5">
            <div className="flex h-44 gap-2">
                <div
                    aria-hidden="true"
                    className="flex w-8 shrink-0 flex-col justify-between pb-0.5 text-right text-[0.65rem] tabular-nums text-gongyu-subtle"
                >
                    <span>{maximum}</span>
                    <span>{maximum > 1 ? midpoint : ''}</span>
                    <span>0</span>
                </div>
                <div className="relative min-w-0 flex-1 border-b border-l border-gongyu-line">
                    <span className="absolute inset-x-0 top-0 border-t border-dashed border-gongyu-line" />
                    <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-gongyu-line" />
                    <ol
                        aria-label={`${granularityLabels[granularity]} bookmark activity: ${total} bookmarks from ${firstLabel} to ${lastLabel}.`}
                        className="absolute inset-0 flex items-end gap-0.5 px-1"
                        role="img"
                    >
                        {points.map((point) => (
                            <li
                                aria-hidden="true"
                                className="flex h-full min-w-0 flex-1 items-end"
                                key={point.date}
                                title={`${point.date}: ${point.count} bookmarks`}
                            >
                                <span
                                    className="block w-full rounded-t-sm bg-gongyu-brand/70 transition-colors hover:bg-gongyu-brand"
                                    style={{
                                        height:
                                            point.count === 0
                                                ? 0
                                                : `${(point.count / maximum) * 100}%`,
                                        minHeight:
                                            point.count === 0 ? 0 : '3px',
                                    }}
                                />
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
            <div
                aria-hidden="true"
                className="ml-10 mt-2 flex justify-between gap-3 text-[0.65rem] text-gongyu-subtle"
            >
                <span>{firstLabel}</span>
                {middleLabel === firstLabel ||
                middleLabel === lastLabel ? null : (
                    <span>{middleLabel}</span>
                )}
                {lastLabel === firstLabel ? null : <span>{lastLabel}</span>}
            </div>
        </div>
    );
}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Overview · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const location = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const period = parsePeriod(location.searchParams.get('period'));
    const stats = await effect.runPromise(
        Effect.gen(function* () {
            const dashboard = yield* DashboardRepository;
            return yield* dashboard.load({ now: Date.now(), period });
        }),
    );
    return { period, stats };
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
    const { period, stats } = loaderData;
    const maximumDomain = Math.max(
        1,
        ...stats.bookmarksByDomain.map((entry) => entry.count),
    );
    const summary = [
        {
            icon: BookmarkSimpleIcon,
            label: 'Total bookmarks',
            value: stats.totalBookmarks,
        },
        {
            icon: CalendarDotsIcon,
            label: 'This month',
            value: stats.bookmarksThisMonth,
        },
        {
            icon: ChartLineUpIcon,
            label: 'This week',
            value: stats.bookmarksThisWeek,
        },
    ];

    return (
        <AdminPage
            actions={
                <LinkButton
                    href="/admin/bookmarks/new"
                    icon={PlusIcon}
                    size="sm"
                    variant="primary"
                >
                    New bookmark
                </LinkButton>
            }
            description="A compact view of your library and recent activity."
            title="Overview"
            width="wide"
        >
            <LayerCard className="overflow-hidden">
                <dl className="grid divide-y divide-gongyu-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {summary.map(({ icon: Icon, label, value }) => (
                        <div
                            className="flex items-center gap-3 px-4 py-3"
                            key={label}
                        >
                            <Icon
                                aria-hidden="true"
                                className="shrink-0 text-gongyu-subtle"
                                size={20}
                            />
                            <div>
                                <dd className="text-xl font-semibold tracking-[-0.03em] text-gongyu-default">
                                    {value.toLocaleString('en-US')}
                                </dd>
                                <dt className="text-xs text-gongyu-subtle">
                                    {label}
                                </dt>
                            </div>
                        </div>
                    ))}
                </dl>
            </LayerCard>

            <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.7fr)]">
                <LayerCard className="min-w-0">
                    <section className="min-w-0 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-semibold text-gongyu-default">
                                    Activity
                                </h2>
                                <p className="mt-1 text-sm text-gongyu-subtle">
                                    Bookmarks saved over time.
                                </p>
                            </div>
                            <nav
                                aria-label="Dashboard period"
                                className="flex flex-wrap gap-1 rounded-lg bg-gongyu-tint p-1"
                            >
                                {periods.map((option) => (
                                    <Link
                                        aria-current={
                                            option.value === period
                                                ? 'page'
                                                : undefined
                                        }
                                        className={cn(
                                            'rounded-md px-2.5 py-1.5 text-xs',
                                            option.value === period
                                                ? 'bg-gongyu-base font-semibold text-gongyu-default shadow-xs ring ring-gongyu-line'
                                                : 'font-medium text-gongyu-subtle hover:text-gongyu-default',
                                        )}
                                        key={option.value}
                                        to={`?period=${option.value}`}
                                    >
                                        {option.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>

                        {stats.bookmarksOverTime.length === 0 ? (
                            <Empty
                                className="mt-5"
                                description="Activity appears after links are added."
                                size="sm"
                                title="No activity yet"
                            />
                        ) : (
                            <ActivityChart
                                granularity={stats.trendGranularity}
                                points={stats.bookmarksOverTime}
                            />
                        )}
                        <details className="mt-4 border-t border-gongyu-line pt-3 text-sm">
                            <summary className="cursor-pointer text-gongyu-link">
                                View{' '}
                                {granularityLabels[
                                    stats.trendGranularity
                                ].toLowerCase()}{' '}
                                totals
                            </summary>
                            <div className="mt-3 max-h-64 overflow-auto">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-gongyu-base">
                                        <tr>
                                            <th className="py-2 pr-4">Date</th>
                                            <th className="py-2">Bookmarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.bookmarksOverTime.map(
                                            (point) => (
                                                <tr key={point.date}>
                                                    <td className="border-t border-gongyu-line py-2 pr-4 text-gongyu-subtle">
                                                        {point.date}
                                                    </td>
                                                    <td className="border-t border-gongyu-line py-2 text-gongyu-default">
                                                        {point.count}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </section>
                </LayerCard>

                <LayerCard className="min-w-0">
                    <section className="min-w-0 p-4">
                        <h2 className="font-semibold text-gongyu-default">
                            Top sources
                        </h2>
                        <p className="mt-1 text-sm text-gongyu-subtle">
                            Domains you save most often.
                        </p>
                        {stats.bookmarksByDomain.length === 0 ? (
                            <Empty
                                className="mt-4"
                                size="sm"
                                title="No sources yet"
                            />
                        ) : (
                            <ol className="mt-4 grid gap-x-5 gap-y-3 2xl:grid-cols-2">
                                {stats.bookmarksByDomain.map((entry) => (
                                    <li
                                        className="min-w-0 space-y-1.5"
                                        key={entry.domain}
                                    >
                                        <div className="flex justify-between gap-3 text-sm">
                                            <span className="truncate text-gongyu-default">
                                                {entry.domain}
                                            </span>
                                            <span className="tabular-nums text-gongyu-subtle">
                                                {entry.count}
                                            </span>
                                        </div>
                                        <div
                                            aria-label={`${entry.domain}: ${entry.count} bookmarks`}
                                            className="h-1.5 overflow-hidden rounded-full bg-gongyu-fill"
                                            role="img"
                                        >
                                            <div
                                                className="h-full rounded-full bg-gongyu-brand/70"
                                                style={{
                                                    width: `${Math.max(4, (entry.count / maximumDomain) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </LayerCard>
            </div>

            <LayerCard>
                <section className="p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-gongyu-default">
                                Recently saved
                            </h2>
                            <p className="mt-1 text-sm text-gongyu-subtle">
                                The latest additions to your library.
                            </p>
                        </div>
                        <Link
                            className="text-sm text-gongyu-link"
                            to="/admin/bookmarks"
                        >
                            View all
                        </Link>
                    </div>
                    {stats.recentBookmarks.length === 0 ? (
                        <Empty
                            className="mt-4"
                            contents={
                                <LinkButton
                                    href="/admin/bookmarks/new"
                                    icon={PlusIcon}
                                    size="sm"
                                    variant="primary"
                                >
                                    New bookmark
                                </LinkButton>
                            }
                            size="sm"
                            title="Nothing saved yet"
                        />
                    ) : (
                        <ol className="mt-4 grid gap-x-8 md:grid-cols-2">
                            {stats.recentBookmarks.map((bookmark) => (
                                <li
                                    className="border-t border-gongyu-line py-3"
                                    key={bookmark.id}
                                >
                                    <Link
                                        className="line-clamp-1 font-medium text-gongyu-default hover:text-gongyu-link"
                                        to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                    >
                                        {bookmark.title}
                                    </Link>
                                    <p className="mt-1 text-xs text-gongyu-subtle">
                                        {formatDate(bookmark.createdAt)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </LayerCard>
        </AdminPage>
    );
}
