import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BookmarkRepository,
    makeBookmarkRepository,
} from '@gongyu/data/bookmark-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import { DuplicateBookmarkError } from '@gongyu/domain/bookmarks';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const BookmarkRepositoryTest = Layer.effect(BookmarkRepository)(
    Effect.gen(function* () {
        const d1Store = yield* D1Store;
        return makeBookmarkRepository(d1Store);
    }),
);
const TestLayer = Layer.provideMerge(BookmarkRepositoryTest, D1StoreTest);

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}

it.layer(TestLayer)('production bookmark repository', (it) => {
    it.effect(
        'atomically creates numeric bookmarks and metadata outbox work',
        () =>
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                const d1Store = yield* D1Store;
                const bookmark = yield* bookmarks.create({
                    createdAt: 1_000,
                    description: 'Cloud platform notes',
                    title: 'Cloudflare architecture',
                    url: 'https://example.com/cloudflare',
                });

                assert.isAbove(bookmark.id, 0);
                assert.match(bookmark.shortUrl, /^[A-Za-z0-9]{8}$/u);
                const outbox = yield* d1Store.first(
                    CountRow,
                    `
                    SELECT COUNT(*) AS count
                    FROM outbox
                    WHERE bookmark_short_url = ?
                      AND kind = 'metadata'
                      AND state = 'pending'
                `,
                    [bookmark.shortUrl],
                );
                assert.strictEqual(outbox?.count, 1);
            }),
    );

    it.effect('rolls the bookmark back when its outbox insert fails', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const d1Store = yield* D1Store;
            const before = yield* d1Store.first(
                CountRow,
                'SELECT COUNT(*) AS count FROM bookmarks',
            );
            yield* d1Store.run(`
                CREATE TRIGGER reject_metadata_outbox
                BEFORE INSERT ON outbox
                WHEN new.kind = 'metadata'
                BEGIN
                    SELECT RAISE(ABORT, 'forced outbox failure');
                END
            `);

            yield* bookmarks
                .create({
                    createdAt: 2_000,
                    description: null,
                    title: 'Must roll back',
                    url: 'https://example.com/rollback',
                })
                .pipe(
                    Effect.flip,
                    Effect.ensuring(
                        d1Store
                            .run('DROP TRIGGER reject_metadata_outbox')
                            .pipe(Effect.orDie),
                    ),
                );
            const after = yield* d1Store.first(
                CountRow,
                'SELECT COUNT(*) AS count FROM bookmarks',
            );
            assert.strictEqual(after?.count, before?.count);
        }),
    );

    it.effect(
        'uses exact duplicate URLs and preserves stable identifiers on update',
        () =>
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                const original = yield* bookmarks.create({
                    createdAt: 3_000,
                    description: null,
                    title: 'Original searchable phrase',
                    url: 'https://example.com/Exact',
                });
                const caseDistinct = yield* bookmarks.create({
                    createdAt: 4_000,
                    description: null,
                    title: 'Case distinct',
                    url: 'https://example.com/exact',
                });
                assert.notStrictEqual(original.id, caseDistinct.id);

                const duplicate = yield* bookmarks
                    .create({
                        createdAt: 5_000,
                        description: null,
                        title: 'Duplicate',
                        url: original.url,
                    })
                    .pipe(Effect.flip);
                assert.instanceOf(duplicate, DuplicateBookmarkError);

                const updated = yield* bookmarks.update({
                    description: 'Description term',
                    shortUrl: original.shortUrl,
                    title: 'Updated searchable phrase',
                    updatedAt: 6_000,
                    url: 'https://example.com/updated',
                });
                assert.strictEqual(updated.id, original.id);
                assert.strictEqual(updated.shortUrl, original.shortUrl);
                assert.strictEqual(
                    (yield* bookmarks.list({
                        page: 1,
                        perPage: 20,
                        query: 'Original',
                    })).total,
                    0,
                );
                assert.strictEqual(
                    (yield* bookmarks.list({
                        page: 1,
                        perPage: 20,
                        query: 'updated Description',
                    })).total,
                    1,
                );
            }),
    );

    it.effect(
        'searches title description and URL without exposing FTS syntax',
        () =>
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                yield* bookmarks.create({
                    createdAt: 7_000,
                    description: 'PostgreSQL optimization',
                    title: 'Database notes',
                    url: 'https://github.com/example/project',
                });

                assert.strictEqual(
                    (yield* bookmarks.list({
                        page: 1,
                        perPage: 20,
                        query: 'postgresql',
                    })).total,
                    1,
                );
                assert.strictEqual(
                    (yield* bookmarks.list({
                        page: 1,
                        perPage: 20,
                        query: 'GITHUB',
                    })).total,
                    1,
                );
                const punctuation = yield* bookmarks.list({
                    page: 1,
                    perPage: 20,
                    query: 'database OR "missing',
                });
                assert.strictEqual(punctuation.total, 0);
            }),
    );

    it.effect('retains mirrored thumbnail state across edits', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const d1Store = yield* D1Store;
            const bookmark = yield* bookmarks.create({
                createdAt: 8_500,
                description: null,
                title: 'Thumbnail original',
                url: 'https://example.com/thumbnail-original',
            });
            const digest = 'a'.repeat(64);
            const key = `thumbnails/${bookmark.shortUrl}/${digest}.png`;
            yield* d1Store.run(
                `
                    UPDATE bookmarks
                    SET
                        thumbnail_url = 'https://images.example/original.png',
                        thumbnail_key = ?,
                        thumbnail_content_type = 'image/png',
                        thumbnail_size = 100,
                        thumbnail_width = 10,
                        thumbnail_height = 10,
                        thumbnail_sha256 = ?
                    WHERE short_url = ?
                `,
                [key, digest, bookmark.shortUrl],
            );

            const updated = yield* bookmarks.update({
                description: 'Only text changed',
                shortUrl: bookmark.shortUrl,
                title: 'Thumbnail updated',
                updatedAt: 8_600,
                url: bookmark.url,
            });

            assert.strictEqual(updated.thumbnailKey, key);
            assert.strictEqual(updated.thumbnailSha256, digest);
            assert.strictEqual(
                updated.thumbnailUrl,
                'https://images.example/original.png',
            );
        }),
    );

    it.effect('atomically marks every active bookmark for deletion', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const d1Store = yield* D1Store;
            yield* bookmarks.create({
                createdAt: 8_700,
                description: null,
                title: 'Bulk one',
                url: 'https://example.com/bulk-one',
            });
            yield* bookmarks.create({
                createdAt: 8_800,
                description: null,
                title: 'Bulk two',
                url: 'https://example.com/bulk-two',
            });

            const activeBefore =
                (yield* d1Store.first(
                    CountRow,
                    `SELECT COUNT(*) AS count FROM bookmarks WHERE deletion_state = 'active'`,
                ))?.count ?? 0;
            assert.isAtLeast(activeBefore, 2);
            assert.strictEqual(yield* bookmarks.removeAll(8_900), activeBefore);
            assert.strictEqual(
                (yield* d1Store.first(
                    CountRow,
                    `SELECT COUNT(*) AS count FROM bookmarks WHERE deletion_state = 'active'`,
                ))?.count,
                0,
            );
            assert.strictEqual(
                (yield* d1Store.first(
                    CountRow,
                    `SELECT COUNT(*) AS count FROM outbox WHERE kind = 'thumbnail_delete' AND state = 'pending'`,
                ))?.count,
                activeBefore,
            );
        }),
    );

    it.effect('supports configured feed sizes above one hundred', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const d1Store = yield* D1Store;
            yield* d1Store.run(`
                WITH RECURSIVE sequence(value) AS (
                    SELECT 1
                    UNION ALL
                    SELECT value + 1 FROM sequence WHERE value < 105
                )
                INSERT INTO bookmarks (
                    short_url,
                    url,
                    title,
                    description,
                    created_at,
                    updated_at
                )
                SELECT
                    printf('F%07d', value),
                    printf('https://feed.example/%d', value),
                    printf('Feed bookmark %d', value),
                    NULL,
                    10000 + value,
                    10000 + value
                FROM sequence
            `);
            const feed = yield* bookmarks.listForFeed(101);
            assert.strictEqual(feed.length, 101);
        }),
    );

    it.effect('removes unmirrored bookmarks from public reads and FTS', () =>
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const bookmark = yield* bookmarks.create({
                createdAt: 9_000,
                description: null,
                title: 'Temporary deletion term',
                url: 'https://example.com/deletion',
            });
            assert.isTrue(yield* bookmarks.remove(bookmark.shortUrl));
            assert.isNull(yield* bookmarks.findByShortUrl(bookmark.shortUrl));
            assert.strictEqual(
                (yield* bookmarks.list({
                    page: 1,
                    perPage: 20,
                    query: 'deletion',
                })).total,
                0,
            );
        }),
    );
});
