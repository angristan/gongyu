import { Effect, Schema } from 'effect';

export class PortableBookmark extends Schema.Class<PortableBookmark>(
    'PortableBookmark',
)({
    createdAt: Schema.Number,
    description: Schema.NullOr(Schema.String),
    id: Schema.NullOr(Schema.Number),
    shaarliShortUrl: Schema.NullOr(Schema.String),
    shortUrl: Schema.NullOr(Schema.String),
    thumbnailUrl: Schema.NullOr(Schema.String),
    title: Schema.String,
    updatedAt: Schema.Number,
    url: Schema.String,
}) {}

export class PortabilityError extends Schema.TaggedErrorClass<PortabilityError>()(
    'PortabilityError',
    {
        code: Schema.String,
        message: Schema.String,
    },
) {}

export class DataWorkflowPayload extends Schema.Class<DataWorkflowPayload>(
    'DataWorkflowPayload',
)({
    format: Schema.NullOr(
        Schema.Union([
            Schema.Literal('gongyu_json'),
            Schema.Literal('netscape_html'),
            Schema.Literal('shaarli_datastore'),
            Schema.Literal('shaarli_api'),
            Schema.Literal('full_backup'),
        ]),
    ),
    kind: Schema.Union([
        Schema.Literal('import'),
        Schema.Literal('export'),
        Schema.Literal('backup'),
        Schema.Literal('restore'),
    ]),
    mode: Schema.NullOr(
        Schema.Union([Schema.Literal('merge'), Schema.Literal('replacement')]),
    ),
    rpId: Schema.String,
    runId: Schema.String,
    sourceEtag: Schema.NullOr(Schema.String),
    sourceKey: Schema.NullOr(Schema.String),
    sourceSha256: Schema.NullOr(Schema.String),
    sourceSize: Schema.NullOr(Schema.Number),
    version: Schema.Literal(1),
}) {}

export interface ParseResult {
    readonly bookmarks: ReadonlyArray<PortableBookmark>;
    readonly errors: ReadonlyArray<{
        readonly code: string;
        readonly message: string;
        readonly rowIndex: number;
    }>;
}

function error(code: string, message: string): PortabilityError {
    return PortabilityError.make({ code, message });
}

export function timestampToMicros(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value * 1_000_000);
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return fallback;
    }
    const compact = value.match(
        /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/u,
    );
    if (compact !== null) {
        return (
            Date.UTC(
                Number(compact[1]),
                Number(compact[2]) - 1,
                Number(compact[3]),
                Number(compact[4]),
                Number(compact[5]),
                Number(compact[6]),
            ) * 1_000
        );
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    const fraction = value.match(/\.(\d{1,6})/u)?.[1] ?? '';
    const micros = Number.parseInt(fraction.padEnd(6, '0'), 10) || 0;
    return Math.trunc(parsed / 1_000) * 1_000_000 + micros;
}

export function microsToIso(value: number): string {
    const seconds = Math.floor(value / 1_000_000);
    const fraction = Math.abs(value % 1_000_000);
    const base = new Date(seconds * 1_000).toISOString().slice(0, 19);
    return fraction === 0
        ? `${base}+00:00`
        : `${base}.${String(fraction).padStart(6, '0')}+00:00`;
}

export function isSafeBookmarkUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            url.hostname !== '' &&
            url.username === '' &&
            url.password === ''
        );
    } catch {
        return false;
    }
}

function nullableString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function parsePortableRecord(
    value: unknown,
    rowIndex: number,
    fallbackNow: number,
): PortableBookmark | { code: string; message: string; rowIndex: number } {
    if (typeof value !== 'object' || value === null) {
        return {
            code: 'invalid_row',
            message: 'Bookmark row must be an object.',
            rowIndex,
        };
    }
    const row = value as Record<string, unknown>;
    const url = typeof row.url === 'string' ? row.url : '';
    if (url === '') {
        return {
            code: 'missing_url',
            message: 'Bookmark is missing its URL.',
            rowIndex,
        };
    }
    if (!isSafeBookmarkUrl(url)) {
        return {
            code: 'invalid_url',
            message: 'Bookmark URL must use HTTP or HTTPS without credentials.',
            rowIndex,
        };
    }
    const createdAt = timestampToMicros(row.created_at, fallbackNow);
    return PortableBookmark.make({
        createdAt,
        description: nullableString(row.description),
        id:
            typeof row.id === 'number' &&
            Number.isSafeInteger(row.id) &&
            row.id > 0
                ? row.id
                : null,
        shaarliShortUrl: nullableString(row.shaarli_short_url),
        shortUrl: nullableString(row.short_url),
        thumbnailUrl: nullableString(row.thumbnail_url),
        title:
            typeof row.title === 'string' && row.title !== '' ? row.title : url,
        updatedAt: timestampToMicros(row.updated_at, createdAt),
        url,
    });
}

export const parseGongyuJson = Effect.fn('Portability.parseGongyuJson')(
    function* (content: string, fallbackNow: number) {
        const decoded = yield* Effect.try({
            try: () => JSON.parse(content) as unknown,
            catch: () => error('invalid_json', 'Invalid JSON format.'),
        });
        if (
            typeof decoded !== 'object' ||
            decoded === null ||
            !('bookmarks' in decoded) ||
            !Array.isArray(decoded.bookmarks)
        ) {
            return yield* error(
                'invalid_gongyu_export',
                'Invalid Gongyu export format: missing bookmarks array.',
            );
        }
        if (
            'version' in decoded &&
            decoded.version !== undefined &&
            decoded.version !== '1.0'
        ) {
            return yield* error(
                'unsupported_version',
                'Unsupported Gongyu export version.',
            );
        }
        const bookmarks: PortableBookmark[] = [];
        const errors: ParseResult['errors'][number][] = [];
        for (const [rowIndex, row] of decoded.bookmarks.entries()) {
            const parsed = parsePortableRecord(row, rowIndex, fallbackNow);
            if (parsed instanceof PortableBookmark) {
                bookmarks.push(parsed);
            } else {
                errors.push(parsed);
            }
        }
        if (
            'count' in decoded &&
            typeof decoded.count === 'number' &&
            decoded.count !== decoded.bookmarks.length
        ) {
            errors.push({
                code: 'count_mismatch',
                message: 'Declared bookmark count does not match the source.',
                rowIndex: -1,
            });
        }
        return { bookmarks, errors } satisfies ParseResult;
    },
);

export const parseShaarliApiJson = Effect.fn('Portability.parseShaarliApiJson')(
    function* (content: string, fallbackNow: number) {
        const decoded = yield* Effect.try({
            try: () => JSON.parse(content) as unknown,
            catch: () =>
                error('invalid_api_response', 'Invalid Shaarli API response.'),
        });
        if (!Array.isArray(decoded)) {
            return yield* error(
                'invalid_api_response',
                'Invalid Shaarli API response: expected an array.',
            );
        }
        const bookmarks: PortableBookmark[] = [];
        const errors: ParseResult['errors'][number][] = [];
        for (const [rowIndex, value] of decoded.entries()) {
            if (typeof value !== 'object' || value === null) {
                errors.push({
                    code: 'invalid_row',
                    message: 'Shaarli row must be an object.',
                    rowIndex,
                });
                continue;
            }
            const row = value as Record<string, unknown>;
            const url = typeof row.url === 'string' ? row.url : '';
            if (url === '') {
                errors.push({
                    code: 'missing_url',
                    message: 'Bookmark is missing its URL.',
                    rowIndex,
                });
                continue;
            }
            if (!isSafeBookmarkUrl(url)) {
                errors.push({
                    code: 'invalid_url',
                    message:
                        'Bookmark URL must use HTTP or HTTPS without credentials.',
                    rowIndex,
                });
                continue;
            }
            const createdAt = timestampToMicros(row.created, fallbackNow);
            bookmarks.push(
                PortableBookmark.make({
                    createdAt,
                    description: nullableString(row.description),
                    id:
                        typeof row.id === 'number' &&
                        Number.isSafeInteger(row.id) &&
                        row.id > 0
                            ? row.id
                            : null,
                    shaarliShortUrl: nullableString(row.shorturl),
                    shortUrl: null,
                    thumbnailUrl: null,
                    title:
                        typeof row.title === 'string' && row.title !== ''
                            ? row.title
                            : url,
                    updatedAt: timestampToMicros(row.updated, createdAt),
                    url,
                }),
            );
        }
        return { bookmarks, errors } satisfies ParseResult;
    },
);

const htmlEntities: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    cent: '¢',
    copy: '©',
    euro: '€',
    gt: '>',
    hellip: '…',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: '\u00a0',
    ndash: '–',
    pound: '£',
    quot: '"',
    rdquo: '”',
    reg: '®',
    rsquo: '’',
    trade: '™',
    yen: '¥',
};

function decodeHtml(value: string): string {
    return value.replace(
        /&(?:#(\d+)|#x([a-f\d]+)|([a-z][a-z\d]+));/giu,
        (entity, decimal: string, hexadecimal: string, named: string) => {
            const codePoint =
                decimal !== undefined
                    ? Number.parseInt(decimal, 10)
                    : hexadecimal !== undefined
                      ? Number.parseInt(hexadecimal, 16)
                      : null;
            if (codePoint !== null) {
                return codePoint >= 0 && codePoint <= 0x10ffff
                    ? String.fromCodePoint(codePoint)
                    : entity;
            }
            return htmlEntities[named.toLowerCase()] ?? entity;
        },
    );
}

function parseAttributes(value: string): Map<string, string> {
    const attributes = new Map<string, string>();
    const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/giu;
    for (const match of value.matchAll(pattern)) {
        attributes.set(
            match[1].toLowerCase(),
            decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''),
        );
    }
    return attributes;
}

export function parseNetscapeHtml(
    content: string,
    fallbackNow: number,
): ParseResult {
    const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const pattern = /<A\s+([^>]+)>([^<]*)<\/A>(?:\s*<DD>([^<\n]*))?/giu;
    const bookmarks: PortableBookmark[] = [];
    const errors: ParseResult['errors'][number][] = [];
    let rowIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
        const attributes = parseAttributes(match[1]);
        const url = attributes.get('href') ?? '';
        if (url === '') {
            errors.push({
                code: 'missing_url',
                message: 'Bookmark is missing its URL.',
                rowIndex,
            });
            rowIndex += 1;
            continue;
        }
        if (!isSafeBookmarkUrl(url)) {
            errors.push({
                code: 'invalid_url',
                message:
                    'Bookmark URL must use HTTP or HTTPS without credentials.',
                rowIndex,
            });
            rowIndex += 1;
            continue;
        }
        const seconds = Number.parseInt(attributes.get('add_date') ?? '', 10);
        const updatedSeconds = Number.parseInt(
            attributes.get('last_modified') ?? '',
            10,
        );
        const query = (() => {
            try {
                return new URL(url).search.slice(1);
            } catch {
                return '';
            }
        })();
        const shaarliHash = /^[A-Za-z0-9_-]{6}$/u.test(query) ? query : null;
        const createdAt = Number.isFinite(seconds)
            ? seconds * 1_000_000
            : fallbackNow;
        bookmarks.push(
            PortableBookmark.make({
                createdAt,
                description: nullableString(
                    decodeHtml((match[3] ?? '').trim()),
                ),
                id: null,
                shaarliShortUrl:
                    nullableString(attributes.get('shaarli_shorturl')) ??
                    shaarliHash,
                shortUrl: nullableString(attributes.get('shorturl')),
                thumbnailUrl: null,
                title: decodeHtml(match[2].trim()) || url,
                updatedAt: Number.isFinite(updatedSeconds)
                    ? updatedSeconds * 1_000_000
                    : createdAt,
                url,
            }),
        );
        rowIndex += 1;
    }
    return { bookmarks, errors };
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export function generateGongyuJson(
    bookmarks: ReadonlyArray<PortableBookmark>,
    exportedAt: string,
): string {
    return JSON.stringify(
        {
            exported_at: exportedAt,
            version: '1.0',
            count: bookmarks.length,
            bookmarks: bookmarks.map((bookmark) => ({
                id: bookmark.id,
                url: bookmark.url,
                title: bookmark.title,
                description: bookmark.description,
                short_url: bookmark.shortUrl,
                shaarli_short_url: bookmark.shaarliShortUrl,
                thumbnail_url: bookmark.thumbnailUrl,
                created_at: microsToIso(bookmark.createdAt),
                updated_at: microsToIso(bookmark.updatedAt),
            })),
        },
        null,
        4,
    );
}

export function generateNetscapeHtml(
    bookmarks: ReadonlyArray<PortableBookmark>,
    exportedAt: Date,
): string {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const pad = (value: number) => String(value).padStart(2, '0');
    const heading = `${weekdays[exportedAt.getUTCDay()]}, ${pad(exportedAt.getUTCDate())} ${months[exportedAt.getUTCMonth()]} ${pad(exportedAt.getUTCFullYear() % 100)} ${pad(exportedAt.getUTCHours())}:${pad(exportedAt.getUTCMinutes())}:${pad(exportedAt.getUTCSeconds())} +0000`;
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     Do Not Edit! -->\n<TITLE>Bookmarks Export</TITLE>\n<H1>Bookmarks export on ${heading}</H1>\n<DL><p>\n`;
    for (const bookmark of bookmarks) {
        const attributes = [
            `HREF="${escapeHtml(bookmark.url)}"`,
            `ADD_DATE="${Math.floor(bookmark.createdAt / 1_000_000)}"`,
            `SHORTURL="${escapeHtml(bookmark.shortUrl ?? '')}"`,
        ];
        if (bookmark.shaarliShortUrl !== null) {
            attributes.push(
                `SHAARLI_SHORTURL="${escapeHtml(bookmark.shaarliShortUrl)}"`,
            );
        }
        if (bookmark.updatedAt !== bookmark.createdAt) {
            attributes.push(
                `LAST_MODIFIED="${Math.floor(bookmark.updatedAt / 1_000_000)}"`,
            );
        }
        html += `<DT><A ${attributes.join(' ')}>${escapeHtml(bookmark.title)}</A>`;
        if (bookmark.description !== null && bookmark.description !== '') {
            html += `\n<DD>${escapeHtml(bookmark.description)}`;
        }
        html += '\n';
    }
    return `${html}</DL><p>\n`;
}
