import {
    DashboardDomainCount,
    type DashboardPeriod,
    DashboardStats,
    type DashboardTrendGranularity,
    DashboardTrendPoint,
} from '@gongyu/domain/dashboard';
import { Context, Effect, Schema } from 'effect';
import type { BookmarkRepositoryShape } from './bookmark-repository';
import type { D1Store, D1StoreFailure } from './d1-store';

const DAY_MS = 24 * 60 * 60 * 1_000;

class CountsRow extends Schema.Class<CountsRow>('DashboardCountsRow')({
    month: Schema.Number,
    total: Schema.Number,
    week: Schema.Number,
}) {}

class TrendRow extends Schema.Class<TrendRow>('DashboardTrendRow')({
    count: Schema.Number,
    date: Schema.String,
}) {}

class UrlRow extends Schema.Class<UrlRow>('DashboardUrlRow')({
    url: Schema.String,
}) {}

class MinimumRow extends Schema.Class<MinimumRow>('DashboardMinimumRow')({
    value: Schema.NullOr(Schema.Number),
}) {}

export interface DashboardRepositoryShape {
    readonly load: (input: {
        readonly now: number;
        readonly period: DashboardPeriod;
    }) => Effect.Effect<DashboardStats, D1StoreFailure>;
}

export class DashboardRepository extends Context.Service<
    DashboardRepository,
    DashboardRepositoryShape
>()('@gongyu/data/DashboardRepository') {}

function startOfUtcDay(value: Date): Date {
    return new Date(
        Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ),
    );
}

function startOfUtcWeek(value: Date): Date {
    const start = startOfUtcDay(value);
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    return start;
}

function periodStart(period: DashboardPeriod, now: Date): Date {
    const start = startOfUtcDay(now);
    if (period === '7d') {
        start.setUTCDate(start.getUTCDate() - 7);
    } else if (period === '30d') {
        start.setUTCDate(start.getUTCDate() - 30);
    } else if (period === '90d') {
        start.setUTCDate(start.getUTCDate() - 90);
    } else if (period === '1y') {
        start.setUTCFullYear(start.getUTCFullYear() - 1);
    }
    return start;
}

function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function trendGranularity(start: Date, end: Date): DashboardTrendGranularity {
    const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
    if (days <= 60) {
        return 'day';
    }
    if (days <= 420) {
        return 'week';
    }
    if (days <= 1_860) {
        return 'month';
    }
    return 'quarter';
}

function startOfTrendBucket(
    value: Date,
    granularity: DashboardTrendGranularity,
): Date {
    if (granularity === 'day') {
        return startOfUtcDay(value);
    }
    if (granularity === 'week') {
        return startOfUtcWeek(value);
    }
    const month =
        granularity === 'quarter'
            ? Math.floor(value.getUTCMonth() / 3) * 3
            : value.getUTCMonth();
    return new Date(Date.UTC(value.getUTCFullYear(), month, 1));
}

function nextTrendBucket(
    value: Date,
    granularity: DashboardTrendGranularity,
): Date {
    const next = new Date(value);
    if (granularity === 'day') {
        next.setUTCDate(next.getUTCDate() + 1);
    } else if (granularity === 'week') {
        next.setUTCDate(next.getUTCDate() + 7);
    } else if (granularity === 'month') {
        next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
        next.setUTCMonth(next.getUTCMonth() + 3);
    }
    return next;
}

function trendLabel(
    value: Date,
    granularity: DashboardTrendGranularity,
    includeYear: boolean,
): string {
    if (granularity === 'quarter') {
        return `Q${Math.floor(value.getUTCMonth() / 3) + 1} ${value.getUTCFullYear()}`;
    }
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
        ...(granularity === 'month' ? {} : { day: 'numeric' }),
        ...(includeYear || granularity === 'month' ? { year: 'numeric' } : {}),
    }).format(value);
}

export function makeDashboardRepository(
    d1Store: D1Store['Service'],
    bookmarks: BookmarkRepositoryShape,
): DashboardRepositoryShape {
    const load = Effect.fn('DashboardRepository.load')(function* (input: {
        readonly now: number;
        readonly period: DashboardPeriod;
    }) {
        const now = new Date(input.now);
        const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
        const weekStart = startOfUtcWeek(now).getTime();
        const counts = yield* d1Store.first(
            CountsRow,
            `
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS month,
                    COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS week
                FROM bookmarks
                WHERE deletion_state = 'active'
            `,
            [monthStart * 1_000, weekStart * 1_000],
        );

        let start = periodStart(input.period, now);
        if (input.period === 'all') {
            const minimum = yield* d1Store.first(
                MinimumRow,
                `
                    SELECT MIN(created_at) AS value
                    FROM bookmarks
                    WHERE deletion_state = 'active'
                `,
            );
            start =
                minimum?.value === null || minimum?.value === undefined
                    ? periodStart('30d', now)
                    : startOfUtcDay(new Date(minimum.value / 1_000));
        }
        const end = startOfUtcDay(now);
        const startMicros = start.getTime() * 1_000;
        const endMicros = (end.getTime() + DAY_MS) * 1_000 - 1;
        const [trendRows, urlRows, recent] = yield* Effect.all([
            d1Store.query(
                TrendRow,
                `
                    SELECT
                        strftime('%Y-%m-%d', created_at / 1000000, 'unixepoch') AS date,
                        COUNT(*) AS count
                    FROM bookmarks
                    WHERE deletion_state = 'active'
                      AND created_at BETWEEN ? AND ?
                    GROUP BY date
                    ORDER BY date
                `,
                [startMicros, endMicros],
            ),
            d1Store.query(
                UrlRow,
                `
                    SELECT url
                    FROM bookmarks
                    WHERE deletion_state = 'active'
                      AND created_at BETWEEN ? AND ?
                `,
                [startMicros, endMicros],
            ),
            bookmarks.list({ page: 1, perPage: 10 }),
        ]);

        const granularity = trendGranularity(start, end);
        const countsByBucket = new Map<string, number>();
        for (const row of trendRows.rows) {
            const rowDate = new Date(`${row.date}T00:00:00.000Z`);
            const key = dateKey(startOfTrendBucket(rowDate, granularity));
            countsByBucket.set(key, (countsByBucket.get(key) ?? 0) + row.count);
        }
        const firstBucket = startOfTrendBucket(start, granularity);
        const includeYear =
            firstBucket.getUTCFullYear() !== end.getUTCFullYear();
        const bookmarksOverTime: DashboardTrendPoint[] = [];
        if (trendRows.rows.length > 0) {
            for (
                let cursor = firstBucket;
                cursor.getTime() <= end.getTime();
                cursor = nextTrendBucket(cursor, granularity)
            ) {
                bookmarksOverTime.push(
                    DashboardTrendPoint.make({
                        count: countsByBucket.get(dateKey(cursor)) ?? 0,
                        date: trendLabel(cursor, granularity, includeYear),
                    }),
                );
            }
        }

        const domainCounts = new Map<string, number>();
        for (const row of urlRows.rows) {
            try {
                const hostname = new URL(row.url).hostname.replace(
                    /^www\./u,
                    '',
                );
                if (hostname !== '') {
                    domainCounts.set(
                        hostname,
                        (domainCounts.get(hostname) ?? 0) + 1,
                    );
                }
            } catch {}
        }
        const bookmarksByDomain = Array.from(domainCounts.entries())
            .sort(
                ([leftDomain, leftCount], [rightDomain, rightCount]) =>
                    rightCount - leftCount ||
                    leftDomain.localeCompare(rightDomain),
            )
            .slice(0, 10)
            .map(([domain, count]) =>
                DashboardDomainCount.make({ count, domain }),
            );

        return DashboardStats.make({
            bookmarksByDomain,
            bookmarksOverTime,
            bookmarksThisMonth: counts?.month ?? 0,
            bookmarksThisWeek: counts?.week ?? 0,
            recentBookmarks: recent.bookmarks,
            totalBookmarks: counts?.total ?? 0,
            trendGranularity: granularity,
        });
    });

    return { load };
}
