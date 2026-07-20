import { LinkButton } from '@cloudflare/kumo/components/button';
import { Empty } from '@cloudflare/kumo/components/empty';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { cn } from '@cloudflare/kumo/utils';
import { DashboardRepository } from '@gongyu/data/dashboard-repository';
import type { DashboardPeriod } from '@gongyu/domain/dashboard';
import {
    BookmarkSimpleIcon,
    CalendarDotsIcon,
    ChartLineUpIcon,
    PlusIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { Link, redirect } from 'react-router';
import { AdminPage } from '../components/admin-page';
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
    const maximumTrend = Math.max(
        1,
        ...stats.bookmarksOverTime.map((point) => point.count),
    );
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
                <dl className="grid divide-y divide-kumo-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {summary.map(({ icon: Icon, label, value }) => (
                        <div
                            className="flex items-center gap-4 px-5 py-4"
                            key={label}
                        >
                            <Icon
                                aria-hidden="true"
                                className="shrink-0 text-kumo-subtle"
                                size={20}
                            />
                            <div>
                                <dd className="text-2xl font-semibold tracking-[-0.03em] text-kumo-default">
                                    {value.toLocaleString('en-US')}
                                </dd>
                                <dt className="text-xs text-kumo-subtle">
                                    {label}
                                </dt>
                            </div>
                        </div>
                    ))}
                </dl>
            </LayerCard>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.7fr)]">
                <LayerCard>
                    <section className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-semibold text-kumo-default">
                                    Activity
                                </h2>
                                <p className="mt-1 text-sm text-kumo-subtle">
                                    Bookmarks saved over time.
                                </p>
                            </div>
                            <nav
                                aria-label="Dashboard period"
                                className="flex flex-wrap gap-1 rounded-lg bg-kumo-tint p-1"
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
                                                ? 'bg-kumo-base font-semibold text-kumo-default shadow-sm'
                                                : 'font-medium text-kumo-subtle hover:text-kumo-default',
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
                            <div className="mt-6 overflow-x-auto">
                                <div
                                    aria-label="Daily bookmark counts"
                                    className="flex h-44 min-w-full items-end gap-1"
                                    role="img"
                                    style={{
                                        width: `${Math.max(100, stats.bookmarksOverTime.length * 12)}px`,
                                    }}
                                >
                                    {stats.bookmarksOverTime.map((point) => (
                                        <div
                                            className="group relative flex h-full min-w-2 flex-1 items-end"
                                            key={point.date}
                                            title={`${point.date}: ${point.count} bookmarks`}
                                        >
                                            <span
                                                className="block w-full min-w-2 rounded-t-sm bg-kumo-brand/65 group-hover:bg-kumo-brand"
                                                style={{
                                                    height: `${Math.max(3, (point.count / maximumTrend) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <details className="mt-4 border-t border-kumo-line pt-3 text-sm">
                            <summary className="cursor-pointer text-kumo-link">
                                View daily totals
                            </summary>
                            <div className="mt-3 max-h-64 overflow-auto">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-kumo-base">
                                        <tr>
                                            <th className="py-2 pr-4">Date</th>
                                            <th className="py-2">Bookmarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.bookmarksOverTime.map(
                                            (point) => (
                                                <tr key={point.date}>
                                                    <td className="border-t border-kumo-line py-2 pr-4 text-kumo-subtle">
                                                        {point.date}
                                                    </td>
                                                    <td className="border-t border-kumo-line py-2 text-kumo-default">
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

                <LayerCard>
                    <section className="p-5 sm:p-6">
                        <h2 className="font-semibold text-kumo-default">
                            Top sources
                        </h2>
                        <p className="mt-1 text-sm text-kumo-subtle">
                            Domains you save most often.
                        </p>
                        {stats.bookmarksByDomain.length === 0 ? (
                            <Empty
                                className="mt-4"
                                size="sm"
                                title="No sources yet"
                            />
                        ) : (
                            <ol className="mt-5 space-y-4">
                                {stats.bookmarksByDomain.map((entry) => (
                                    <li
                                        className="space-y-1.5"
                                        key={entry.domain}
                                    >
                                        <div className="flex justify-between gap-3 text-sm">
                                            <span className="truncate text-kumo-default">
                                                {entry.domain}
                                            </span>
                                            <span className="tabular-nums text-kumo-subtle">
                                                {entry.count}
                                            </span>
                                        </div>
                                        <div className="h-1 overflow-hidden rounded-full bg-kumo-fill">
                                            <div
                                                className="h-full rounded-full bg-kumo-brand/65"
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
                <section className="p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-kumo-default">
                                Recently saved
                            </h2>
                            <p className="mt-1 text-sm text-kumo-subtle">
                                The latest additions to your library.
                            </p>
                        </div>
                        <Link
                            className="text-sm text-kumo-link"
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
                                    className="border-t border-kumo-line py-3"
                                    key={bookmark.id}
                                >
                                    <Link
                                        className="line-clamp-1 font-medium text-kumo-default hover:text-kumo-link"
                                        to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                    >
                                        {bookmark.title}
                                    </Link>
                                    <p className="mt-1 text-xs text-kumo-subtle">
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
