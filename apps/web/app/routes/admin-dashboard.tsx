import { Badge } from '@cloudflare/kumo/components/badge';
import { LinkButton } from '@cloudflare/kumo/components/button';
import { Empty } from '@cloudflare/kumo/components/empty';
import { Grid } from '@cloudflare/kumo/components/grid';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { DashboardRepository } from '@gongyu/data/dashboard-repository';
import type { DashboardPeriod } from '@gongyu/domain/dashboard';
import {
    BookmarkSimpleIcon,
    CalendarDotsIcon,
    ChartLineUpIcon,
    GlobeHemisphereWestIcon,
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
    return (
        <AdminPage
            actions={
                <LinkButton
                    href="/admin/bookmarks/new"
                    icon={PlusIcon}
                    variant="primary"
                >
                    Save a link
                </LinkButton>
            }
            description="A quick read on the library, recent activity, and where saved links come from."
            title="Overview"
        >
            <Grid variant="3up">
                {[
                    {
                        icon: BookmarkSimpleIcon,
                        label: 'Total bookmarks',
                        value: stats.totalBookmarks,
                    },
                    {
                        icon: CalendarDotsIcon,
                        label: 'Added this month',
                        value: stats.bookmarksThisMonth,
                    },
                    {
                        icon: ChartLineUpIcon,
                        label: 'Added this week',
                        value: stats.bookmarksThisWeek,
                    },
                ].map(({ icon: Icon, label, value }) => (
                    <LayerCard className="overflow-hidden" key={label}>
                        <dl className="relative p-5 sm:p-6">
                            <div className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl bg-kumo-tint text-kumo-link">
                                <Icon aria-hidden="true" size={21} />
                            </div>
                            <dt className="pr-12 text-sm font-medium text-kumo-subtle">
                                {label}
                            </dt>
                            <dd className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-kumo-default">
                                {value.toLocaleString('en-US')}
                            </dd>
                        </dl>
                    </LayerCard>
                ))}
            </Grid>

            <LayerCard>
                <section className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-kumo-default">
                                    Library growth
                                </h2>
                                <Badge variant="secondary">
                                    {periods.find(
                                        (option) => option.value === period,
                                    )?.label ?? '30 days'}
                                </Badge>
                            </div>
                            <p className="mt-1 text-sm text-kumo-subtle">
                                Bookmarks saved per day during this period.
                            </p>
                        </div>
                        <nav
                            aria-label="Dashboard period"
                            className="flex flex-wrap gap-1 rounded-xl bg-kumo-tint p-1"
                        >
                            {periods.map((option) => (
                                <Link
                                    aria-current={
                                        option.value === period
                                            ? 'page'
                                            : undefined
                                    }
                                    className={
                                        option.value === period
                                            ? 'rounded-lg bg-kumo-base px-3 py-1.5 text-xs font-semibold text-kumo-default shadow-sm'
                                            : 'rounded-lg px-3 py-1.5 text-xs font-medium text-kumo-subtle hover:text-kumo-default'
                                    }
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
                            className="mt-6"
                            description="Activity will appear after links are added."
                            size="sm"
                            title="No activity in this period"
                        />
                    ) : (
                        <div className="mt-8 overflow-x-auto pb-2">
                            <div
                                aria-label="Daily bookmark counts"
                                className="flex h-48 min-w-full items-end gap-1"
                                role="img"
                                style={{
                                    width: `${Math.max(100, stats.bookmarksOverTime.length * 14)}px`,
                                }}
                            >
                                {stats.bookmarksOverTime.map((point) => (
                                    <div
                                        className="group relative flex h-full min-w-2 flex-1 items-end"
                                        key={point.date}
                                        title={`${point.date}: ${point.count} bookmarks`}
                                    >
                                        <span
                                            className="block w-full min-w-2 rounded-t bg-kumo-brand/75 transition-colors group-hover:bg-kumo-brand"
                                            style={{
                                                height: `${Math.max(3, (point.count / maximumTrend) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <details className="mt-5 border-t border-kumo-line pt-4 text-sm">
                        <summary className="cursor-pointer font-medium text-kumo-link">
                            View accessible daily table
                        </summary>
                        <div className="mt-4 max-h-72 overflow-auto">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-kumo-base">
                                    <tr>
                                        <th className="py-2 pr-4">Date</th>
                                        <th className="py-2">Bookmarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.bookmarksOverTime.map((point) => (
                                        <tr key={point.date}>
                                            <td className="border-t border-kumo-line py-2 pr-4 text-kumo-subtle">
                                                {point.date}
                                            </td>
                                            <td className="border-t border-kumo-line py-2 text-kumo-default">
                                                {point.count}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>
            </LayerCard>

            <div className="grid gap-6 lg:grid-cols-2">
                <LayerCard>
                    <section className="p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-kumo-default">
                                    Recently saved
                                </h2>
                                <p className="mt-1 text-sm text-kumo-subtle">
                                    The latest additions to the library.
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
                                        Save a link
                                    </LinkButton>
                                }
                                size="sm"
                                title="Nothing saved yet"
                            />
                        ) : (
                            <ol className="mt-5 divide-y divide-kumo-line">
                                {stats.recentBookmarks.map((bookmark) => (
                                    <li
                                        className="py-3 first:pt-0"
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

                <LayerCard>
                    <section className="p-5 sm:p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-lg bg-kumo-tint text-kumo-link">
                                <GlobeHemisphereWestIcon
                                    aria-hidden="true"
                                    size={19}
                                />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-kumo-default">
                                    Top domains
                                </h2>
                                <p className="text-sm text-kumo-subtle">
                                    Most common sources in the library.
                                </p>
                            </div>
                        </div>
                        {stats.bookmarksByDomain.length === 0 ? (
                            <Empty
                                className="mt-4"
                                size="sm"
                                title="No domains yet"
                            />
                        ) : (
                            <ol className="mt-6 space-y-4">
                                {stats.bookmarksByDomain.map((entry) => (
                                    <li
                                        className="space-y-2"
                                        key={entry.domain}
                                    >
                                        <div className="flex justify-between gap-4 text-sm">
                                            <span className="truncate font-medium text-kumo-default">
                                                {entry.domain}
                                            </span>
                                            <span className="text-kumo-subtle">
                                                {entry.count}
                                            </span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-kumo-fill">
                                            <div
                                                className="h-full rounded-full bg-kumo-brand/70"
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
        </AdminPage>
    );
}
