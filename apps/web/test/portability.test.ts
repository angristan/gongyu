import { assert, it } from '@effect/vitest';
import {
    generateGongyuJson,
    generateNetscapeHtml,
    PortableBookmark,
    parseGongyuJson,
    parseNetscapeHtml,
    parseShaarliApiJson,
    timestampToMicros,
} from '@gongyu/domain/portability';
import { Effect } from 'effect';

it.effect('preserves Gongyu IDs identifiers sources and microseconds', () =>
    Effect.gen(function* () {
        const content = JSON.stringify({
            bookmarks: [
                {
                    id: 42,
                    url: 'https://example.com/é',
                    title: 'Unicode 你好',
                    description: null,
                    short_url: 'AbCd1234',
                    shaarli_short_url: 'xy_Z90',
                    thumbnail_url: 'https://example.com/image.webp',
                    created_at: '2025-01-01T01:02:03.123456+01:00',
                    updated_at: '2025-01-01T00:02:04.000001Z',
                },
            ],
            count: 1,
            version: '1.0',
        });
        const parsed = yield* parseGongyuJson(content, 1);
        assert.lengthOf(parsed.bookmarks, 1);
        const bookmark = parsed.bookmarks[0];
        assert.strictEqual(bookmark.id, 42);
        assert.strictEqual(bookmark.shortUrl, 'AbCd1234');
        assert.strictEqual(bookmark.shaarliShortUrl, 'xy_Z90');
        assert.strictEqual(
            bookmark.thumbnailUrl,
            'https://example.com/image.webp',
        );
        assert.strictEqual(
            bookmark.createdAt,
            timestampToMicros('2025-01-01T00:02:03.123456Z', 0),
        );
        assert.strictEqual(bookmark.updatedAt % 1_000_000, 1);

        const exported = generateGongyuJson(
            parsed.bookmarks,
            '2025-01-02T00:00:00+00:00',
        );
        assert.include(exported, '"version": "1.0"');
        assert.include(exported, '"id": 42');
        assert.include(exported, 'https://example.com/é');
        assert.include(exported, '2025-01-01T00:02:03.123456+00:00');
        assert.notMatch(exported, /\\\//u);
        assert.isFalse(exported.endsWith('\n'));
    }),
);

it.effect('reports wrong versions and count mismatches', () =>
    Effect.gen(function* () {
        const version = yield* parseGongyuJson(
            JSON.stringify({ bookmarks: [], version: '2.0' }),
            1,
        ).pipe(Effect.flip);
        assert.strictEqual(version.code, 'unsupported_version');

        const count = yield* parseGongyuJson(
            JSON.stringify({
                bookmarks: [{ url: 'https://example.com', title: 'Example' }],
                count: 2,
                version: '1.0',
            }),
            1,
        );
        assert.strictEqual(count.errors[0]?.code, 'count_mismatch');
    }),
);

it.effect('round-trips Netscape custom identifiers and timestamps', () =>
    Effect.sync(() => {
        const bookmark = PortableBookmark.make({
            createdAt: 1_703_350_800_000_000,
            description: 'Description with "quotes" & details',
            id: 7,
            shaarliShortUrl: 'xyz789',
            shortUrl: 'abc12345',
            thumbnailUrl: null,
            title: 'Title <safe>',
            updatedAt: 1_703_350_900_000_000,
            url: 'https://example.com/?foo=bar&baz=qux',
        });
        const html = generateNetscapeHtml(
            [bookmark],
            new Date('2025-01-02T03:04:05Z'),
        );
        assert.include(
            html,
            '<H1>Bookmarks export on Thu, 02 Jan 25 03:04:05 +0000</H1>',
        );
        assert.include(html, 'SHORTURL="abc12345"');
        assert.include(html, 'SHAARLI_SHORTURL="xyz789"');
        assert.include(html, 'LAST_MODIFIED="1703350900"');
        assert.include(html, 'foo=bar&amp;baz=qux');
        assert.notInclude(html, '<safe>');
        assert.isTrue(html.endsWith('</DL><p>\n'));

        const parsed = parseNetscapeHtml(html, 1);
        assert.lengthOf(parsed.bookmarks, 1);
        assert.strictEqual(parsed.bookmarks[0].shortUrl, 'abc12345');
        assert.strictEqual(parsed.bookmarks[0].shaarliShortUrl, 'xyz789');
        assert.strictEqual(parsed.bookmarks[0].createdAt, bookmark.createdAt);
        assert.strictEqual(parsed.bookmarks[0].updatedAt, bookmark.updatedAt);
        assert.strictEqual(
            parsed.bookmarks[0].description,
            bookmark.description,
        );
    }),
);

it.effect('preserves stable Shaarli API IDs and hashes', () =>
    Effect.gen(function* () {
        const parsed = yield* parseShaarliApiJson(
            JSON.stringify([
                {
                    id: 99,
                    shorturl: 'Sha99x',
                    url: 'https://example.com/shaarli',
                    title: 'Shaarli',
                    description: 'Imported',
                    created: '20250101_010203',
                },
            ]),
            1,
        );
        assert.strictEqual(parsed.bookmarks[0].id, 99);
        assert.strictEqual(parsed.bookmarks[0].shaarliShortUrl, 'Sha99x');
        assert.strictEqual(parsed.bookmarks[0].shortUrl, null);
        assert.strictEqual(
            parsed.bookmarks[0].createdAt,
            1_735_693_323_000_000,
        );
    }),
);

it.effect('uses explicit Shaarli attributes before query fallbacks', () =>
    Effect.sync(() => {
        const parsed = parseNetscapeHtml(
            `<DT><A HREF="https://example.com/?abcdef" ADD_DATE="10" SHORTURL="AbCd1234" SHAARLI_SHORTURL="explicit">Title</A>`,
            1,
        );
        assert.strictEqual(parsed.bookmarks[0].shortUrl, 'AbCd1234');
        assert.strictEqual(parsed.bookmarks[0].shaarliShortUrl, 'explicit');
        assert.strictEqual(parsed.bookmarks[0].createdAt, 10_000_000);
    }),
);

it.effect('decodes Netscape entities and reports invalid URLs', () =>
    Effect.sync(() => {
        const parsed = parseNetscapeHtml(
            `<DT><A HREF="https://example.com/?q=&#x4F60;&#22909;">Title &copy;</A>\n<DT><A HREF="not a url">Invalid</A>`,
            1,
        );
        assert.strictEqual(
            parsed.bookmarks[0].url,
            'https://example.com/?q=你好',
        );
        assert.strictEqual(parsed.bookmarks[0].title, 'Title ©');
        assert.strictEqual(parsed.errors[0]?.code, 'invalid_url');
    }),
);
