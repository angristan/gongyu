import { Schema } from 'effect';
import { Bookmark } from './bookmarks';

export const DashboardPeriod = Schema.Union([
    Schema.Literal('7d'),
    Schema.Literal('30d'),
    Schema.Literal('90d'),
    Schema.Literal('1y'),
    Schema.Literal('all'),
]);
export type DashboardPeriod = typeof DashboardPeriod.Type;

export const DashboardTrendGranularity = Schema.Union([
    Schema.Literal('day'),
    Schema.Literal('week'),
    Schema.Literal('month'),
    Schema.Literal('quarter'),
]);
export type DashboardTrendGranularity = typeof DashboardTrendGranularity.Type;

export class DashboardTrendPoint extends Schema.Class<DashboardTrendPoint>(
    'DashboardTrendPoint',
)({
    count: Schema.Number,
    date: Schema.String,
}) {}

export class DashboardDomainCount extends Schema.Class<DashboardDomainCount>(
    'DashboardDomainCount',
)({
    count: Schema.Number,
    domain: Schema.String,
}) {}

export class DashboardStats extends Schema.Class<DashboardStats>(
    'DashboardStats',
)({
    bookmarksByDomain: Schema.Array(DashboardDomainCount),
    bookmarksOverTime: Schema.Array(DashboardTrendPoint),
    bookmarksThisMonth: Schema.Number,
    bookmarksThisWeek: Schema.Number,
    recentBookmarks: Schema.Array(Bookmark),
    totalBookmarks: Schema.Number,
    trendGranularity: DashboardTrendGranularity,
}) {}
