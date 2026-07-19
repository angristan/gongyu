import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    DashboardRepository,
    makeDashboardRepository,
} from '@gongyu/data/dashboard-repository';
import { Effect, Layer } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const BookmarkRepositoryTest = Layer.effect(BookmarkRepository)(
    Effect.gen(function* () {
        const d1Store = yield* D1Store;
        return makeBookmarkRepository(d1Store);
    }),
);
const DashboardRepositoryTest = Layer.effect(DashboardRepository)(
    Effect.gen(function* () {
        const d1Store = yield* D1Store;
        const bookmarks = yield* BookmarkRepository;
        return makeDashboardRepository(d1Store, bookmarks);
    }),
);
const TestLayer = Layer.provideMerge(
    DashboardRepositoryTest,
    Layer.provideMerge(BookmarkRepositoryTest, D1StoreTest),
);

function micros(iso: string): number {
    return Date.parse(iso) * 1_000;
}

it.layer(TestLayer)('dashboard repository', (it) => {
    it.effect(
        'computes UTC cards inclusive trends recent rows and domains',
        () =>
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                const dashboard = yield* DashboardRepository;
                yield* bookmarks.create({
                    createdAt: micros('2025-01-14T10:00:00.000Z'),
                    description: null,
                    title: 'This week',
                    url: 'https://www.example.com/week',
                });
                yield* bookmarks.create({
                    createdAt: micros('2025-01-05T10:00:00.000Z'),
                    description: null,
                    title: 'This month',
                    url: 'https://example.com/month',
                });
                yield* bookmarks.create({
                    createdAt: micros('2024-12-01T10:00:00.000Z'),
                    description: null,
                    title: 'Older',
                    url: 'https://other.example/older',
                });

                const now = Date.parse('2025-01-15T12:00:00.000Z');
                const thirtyDays = yield* dashboard.load({
                    now,
                    period: '30d',
                });
                assert.strictEqual(thirtyDays.totalBookmarks, 3);
                assert.strictEqual(thirtyDays.bookmarksThisMonth, 2);
                assert.strictEqual(thirtyDays.bookmarksThisWeek, 1);
                assert.strictEqual(thirtyDays.bookmarksOverTime.length, 31);
                assert.strictEqual(
                    thirtyDays.recentBookmarks[0]?.title,
                    'This week',
                );
                assert.deepEqual(
                    thirtyDays.bookmarksByDomain.map((entry) => [
                        entry.domain,
                        entry.count,
                    ]),
                    [['example.com', 2]],
                );

                const all = yield* dashboard.load({ now, period: 'all' });
                assert.strictEqual(all.bookmarksOverTime.length, 46);
                assert.deepEqual(
                    all.bookmarksByDomain.map((entry) => [
                        entry.domain,
                        entry.count,
                    ]),
                    [
                        ['example.com', 2],
                        ['other.example', 1],
                    ],
                );
            }),
    );
});
