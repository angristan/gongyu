import type { Bookmark } from './bookmarks';

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function instant(microseconds: number): string {
    return new Date(Math.floor(microseconds / 1_000)).toISOString();
}

export function generateAtomFeed(input: {
    readonly baseUrl: string;
    readonly bookmarks: ReadonlyArray<Bookmark>;
    readonly updatedAt: number;
}): string {
    const baseUrl = input.baseUrl.replace(/\/$/u, '');
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        '  <title>Gongyu</title>',
        `  <link href="${escapeXml(baseUrl)}" rel="alternate"/>`,
        `  <link href="${escapeXml(`${baseUrl}/feed`)}" rel="self"/>`,
        `  <id>${escapeXml(baseUrl)}</id>`,
        `  <updated>${instant(input.updatedAt)}</updated>`,
    ];

    for (const bookmark of input.bookmarks) {
        const bookmarkUrl = `${baseUrl}/b/${bookmark.shortUrl}`;
        lines.push(
            '  <entry>',
            `    <title>${escapeXml(bookmark.title)}</title>`,
            `    <link href="${escapeXml(bookmark.url)}" rel="alternate"/>`,
            `    <link href="${escapeXml(bookmarkUrl)}" rel="via"/>`,
            `    <id>${escapeXml(bookmarkUrl)}</id>`,
            `    <updated>${instant(bookmark.updatedAt)}</updated>`,
            `    <published>${instant(bookmark.createdAt)}</published>`,
        );
        if (bookmark.description !== null && bookmark.description !== '') {
            lines.push(
                `    <summary type="text">${escapeXml(bookmark.description)}</summary>`,
            );
        }
        lines.push('  </entry>');
    }
    lines.push('</feed>');
    return lines.join('\n');
}
