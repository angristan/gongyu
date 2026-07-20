import { Grid } from '@cloudflare/kumo/components/grid';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { DashboardRepository } from '@gongyu/data/dashboard-repository';
import type { DashboardPeriod } from '@gongyu/domain/dashboard';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { Link, redirect } from 'react-router';
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
    return [{ title: 'Dashboard · Gongyu' }];
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
    return (
        <PageShell
            description="Counts, recent activity, daily trends, and common domains."
            eyebrow="Administrator"
            footer={
                <div className="flex flex-wrap gap-4">
                    <Link className="text-kumo-link" to="/admin/bookmarks">
                        Bookmarks
                    </Link>
                    <Link className="text-kumo-link" to="/admin/settings">
                        Settings
                    </Link>
                    <Link className="text-kumo-link" to="/admin/jobs">
                        Jobs
                    </Link>
                    <Link className="text-kumo-link" to="/admin/data">
                        Data
                    </Link>
                    <Link className="text-kumo-link" to="/bookmarklet">
                        Bookmarklet
                    </Link>
                </div>
            }
            title="Dashboard"
            width="wide"
        >
            <Grid variant="3up">
                {[
                    { label: 'Total bookmarks', value: stats.totalBookmarks },
                    {
                        label: 'Added this month',
                        value: stats.bookmarksThisMonth,
                    },
                    {
                        label: 'Added this week',
                        value: stats.bookmarksThisWeek,
                    },
                ].map(({ label, value }) => (
                    <LayerCard key={label}>
                        <dl className="p-5">
                            <dt className="text-sm text-kumo-subtle">
                                {label}
                            </dt>
                            <dd className="mt-2 text-3xl font-semibold text-kumo-default">
                                {value}
                            </dd>
                        </dl>
                    </LayerCard>
                ))}
            </Grid>

            <nav
                aria-label="Dashboard period"
                className="mt-8 flex flex-wrap gap-3"
            >
                {periods.map((option) => (
                    <Link
                        aria-current={
                            option.value === period ? 'page' : undefined
                        }
                        className={
                            option.value === period
                                ? 'font-semibold text-kumo-default underline'
                                : 'text-kumo-link'
                        }
                        key={option.value}
                        to={`?period=${option.value}`}
                    >
                        {option.label}
                    </Link>
                ))}
            </nav>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <LayerCard>
                    <section className="p-5">
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Recent bookmarks
                        </h2>
                        <ol className="mt-4 space-y-3">
                            {stats.recentBookmarks.map((bookmark) => (
                                <li key={bookmark.id}>
                                    <Link
                                        className="font-medium text-kumo-link"
                                        to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                    >
                                        {bookmark.title}
                                    </Link>
                                    <p className="text-sm text-kumo-subtle">
                                        {formatDate(bookmark.createdAt)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </LayerCard>
                <LayerCard>
                    <section className="p-5">
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Top domains
                        </h2>
                        <ol className="mt-4 space-y-2">
                            {stats.bookmarksByDomain.map((entry) => (
                                <li
                                    className="flex justify-between gap-4"
                                    key={entry.domain}
                                >
                                    <span className="truncate text-kumo-default">
                                        {entry.domain}
                                    </span>
                                    <span className="text-kumo-subtle">
                                        {entry.count}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </section>
                </LayerCard>
            </div>

            <LayerCard className="mt-6">
                <details className="p-5">
                    <summary className="cursor-pointer font-semibold text-kumo-default">
                        Daily bookmark counts
                    </summary>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr>
                                    <th className="py-2 pr-4">Date</th>
                                    <th className="py-2">Bookmarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.bookmarksOverTime.map((point) => (
                                    <tr key={point.date}>
                                        <td className="border-t border-kumo-line py-2 pr-4">
                                            {point.date}
                                        </td>
                                        <td className="border-t border-kumo-line py-2">
                                            {point.count}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            </LayerCard>
        </PageShell>
    );
}
