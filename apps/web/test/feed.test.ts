import { assert, it } from '@effect/vitest';
import { Bookmark } from '@gongyu/domain/bookmarks';
import { generateAtomFeed } from '@gongyu/domain/feed';
import { Effect } from 'effect';

it.effect('generates escaped Atom entries with canonical via links', () =>
    Effect.sync(() => {
        const feed = generateAtomFeed({
            baseUrl: 'https://gongyu.example',
            bookmarks: [
                Bookmark.make({
                    createdAt: 1_735_689_600_000_000,
                    deletionState: 'active',
                    description: 'A <summary> & notes',
                    id: 1,
                    shaarliShortUrl: null,
                    shortUrl: 'AbCd1234',
                    thumbnailCleanupKey: null,
                    thumbnailKey: null,
                    thumbnailSha256: null,
                    thumbnailUrl: null,
                    title: 'Title & details',
                    updatedAt: 1_735_689_601_000_000,
                    url: 'https://example.com/?a=1&b=2',
                }),
            ],
            updatedAt: 1_735_689_602_000_000,
        });

        assert.include(feed, '<?xml version="1.0" encoding="UTF-8"?>');
        assert.include(feed, '<feed xmlns="http://www.w3.org/2005/Atom">');
        assert.include(feed, '<title>Title &amp; details</title>');
        assert.include(
            feed,
            'href="https://example.com/?a=1&amp;b=2" rel="alternate"',
        );
        assert.include(
            feed,
            'href="https://gongyu.example/b/AbCd1234" rel="via"',
        );
        assert.include(
            feed,
            '<summary type="text">A &lt;summary&gt; &amp; notes</summary>',
        );
        assert.include(feed, '<published>2025-01-01T00:00:00.000Z</published>');
        assert.include(feed, '<updated>2025-01-01T00:00:02.000Z</updated>');
    }),
);
