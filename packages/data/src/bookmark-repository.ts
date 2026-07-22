import {
    Bookmark,
    type BookmarkInput,
    BookmarkNotFoundError,
    BookmarkPage,
    DuplicateBookmarkError,
} from '@gongyu/domain/bookmarks';
import {
    type SocialProvider,
    SocialSourceSnapshot,
} from '@gongyu/domain/social';
import { Context, Effect, Schema } from 'effect';
import type { D1Statement, D1Store, D1StoreFailure } from './d1-store';

const SHORT_URL_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_URL_RANDOM_CEILING = 248;

class CountRow extends Schema.Class<CountRow>('BookmarkCountRow')({
    count: Schema.Number,
}) {}

export interface CreateBookmarkInput extends BookmarkInput {
    readonly createdAt: number;
    readonly socialProviders?: ReadonlyArray<SocialProvider>;
}

export interface UpdateBookmarkInput extends BookmarkInput {
    readonly shortUrl: string;
    readonly updatedAt: number;
}

export interface BookmarkRepositoryShape {
    readonly create: (
        input: CreateBookmarkInput,
    ) => Effect.Effect<Bookmark, DuplicateBookmarkError | D1StoreFailure>;
    readonly findByShaarliHash: (
        hash: string,
    ) => Effect.Effect<Bookmark | null, D1StoreFailure>;
    readonly findByShortUrl: (
        shortUrl: string,
    ) => Effect.Effect<Bookmark | null, D1StoreFailure>;
    readonly findByUrl: (
        url: string,
    ) => Effect.Effect<Bookmark | null, D1StoreFailure>;
    readonly list: (input: {
        readonly page: number;
        readonly perPage: number;
        readonly query?: string;
    }) => Effect.Effect<BookmarkPage, D1StoreFailure>;
    readonly listForFeed: (
        limit: number,
    ) => Effect.Effect<ReadonlyArray<Bookmark>, D1StoreFailure>;
    readonly latestUpdatedAt: Effect.Effect<number | null, D1StoreFailure>;
    readonly remove: (
        shortUrl: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly removeAll: (now: number) => Effect.Effect<number, D1StoreFailure>;
    readonly update: (
        input: UpdateBookmarkInput,
    ) => Effect.Effect<
        Bookmark,
        BookmarkNotFoundError | DuplicateBookmarkError | D1StoreFailure
    >;
}

export class BookmarkRepository extends Context.Service<
    BookmarkRepository,
    BookmarkRepositoryShape
>()('@gongyu/data/BookmarkRepository') {}

function randomShortUrl(): string {
    const result: string[] = [];
    while (result.length < 8) {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        for (const byte of bytes) {
            if (byte >= SHORT_URL_RANDOM_CEILING) {
                continue;
            }
            result.push(
                SHORT_URL_ALPHABET[byte % SHORT_URL_ALPHABET.length] ?? '0',
            );
            if (result.length === 8) {
                break;
            }
        }
    }
    return result.join('');
}

function bookmarkProjection(): string {
    return `
        SELECT
            id,
            short_url AS "shortUrl",
            shaarli_short_url AS "shaarliShortUrl",
            url,
            title,
            description,
            thumbnail_url AS "thumbnailUrl",
            thumbnail_key AS "thumbnailKey",
            thumbnail_cleanup_key AS "thumbnailCleanupKey",
            thumbnail_sha256 AS "thumbnailSha256",
            deletion_state AS "deletionState",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM bookmarks
    `;
}

function makeFtsQuery(query: string): string {
    return query
        .trim()
        .split(/\s+/u)
        .filter((part) => part.length > 0)
        .map((part) => `"${part.replaceAll('"', '""')}"`)
        .join(' AND ');
}

export function makeBookmarkRepository(
    d1Store: D1Store['Service'],
): BookmarkRepositoryShape {
    const findByShortUrl = Effect.fn('BookmarkRepository.findByShortUrl')(
        (shortUrl: string) =>
            d1Store.first(
                Bookmark,
                `${bookmarkProjection()}
                 WHERE short_url = ? AND deletion_state = 'active'`,
                [shortUrl],
            ),
    );

    const findByUrl = Effect.fn('BookmarkRepository.findByUrl')((url: string) =>
        d1Store.first(
            Bookmark,
            `${bookmarkProjection()}
                 WHERE url = ? AND deletion_state = 'active'`,
            [url],
        ),
    );

    const findByShaarliHash = Effect.fn('BookmarkRepository.findByShaarliHash')(
        (hash: string) =>
            d1Store.first(
                Bookmark,
                `${bookmarkProjection()}
                 WHERE shaarli_short_url = ? AND deletion_state = 'active'`,
                [hash],
            ),
    );

    const create = Effect.fn('BookmarkRepository.create')(function* (
        input: CreateBookmarkInput,
    ) {
        const duplicate = yield* d1Store.first(
            CountRow,
            'SELECT COUNT(*) AS count FROM bookmarks WHERE url = ?',
            [input.url],
        );
        if ((duplicate?.count ?? 0) > 0) {
            return yield* DuplicateBookmarkError.make({ url: input.url });
        }

        let shortUrl = '';
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const candidate = randomShortUrl();
            const existing = yield* d1Store.first(
                CountRow,
                'SELECT COUNT(*) AS count FROM bookmarks WHERE short_url = ?',
                [candidate],
            );
            if ((existing?.count ?? 0) === 0) {
                shortUrl = candidate;
                break;
            }
        }
        if (shortUrl === '') {
            return yield* Effect.die(
                new Error('Unable to allocate a unique bookmark short URL.'),
            );
        }

        const outboxId = `metadata:${shortUrl}:1`;
        const statements: D1Statement[] = [
            {
                sql: `
                    INSERT INTO bookmarks (
                        short_url,
                        url,
                        title,
                        description,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `,
                parameters: [
                    shortUrl,
                    input.url,
                    input.title,
                    input.description,
                    input.createdAt,
                    input.createdAt,
                ],
            },
            {
                sql: `
                    INSERT INTO outbox (
                        id,
                        bookmark_short_url,
                        kind,
                        state,
                        payload_version,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, 'metadata', 'pending', 1, ?, ?)
                `,
                parameters: [
                    outboxId,
                    shortUrl,
                    input.createdAt,
                    input.createdAt,
                ],
            },
        ];
        for (const provider of new Set(input.socialProviders ?? [])) {
            const deliveryId = `social:${shortUrl}:${provider}:v1`;
            const source = SocialSourceSnapshot.make({
                description: input.description,
                originalUrl: input.url,
                schemaVersion: 1,
                shortUrl,
                title: input.title,
            });
            statements.push({
                sql: `
                    INSERT INTO social_deliveries (
                        id,
                        bookmark_short_url,
                        provider,
                        state,
                        formatting_version,
                        source_json,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, 'waiting_metadata', 1, ?, ?, ?)
                `,
                parameters: [
                    deliveryId,
                    shortUrl,
                    provider,
                    JSON.stringify(source),
                    input.createdAt,
                    input.createdAt,
                ],
            });
        }
        yield* d1Store.batch(statements);

        const bookmark = yield* findByShortUrl(shortUrl);
        if (bookmark === null) {
            return yield* Effect.die(
                new Error('Created bookmark could not be loaded.'),
            );
        }
        return bookmark;
    });

    const update = Effect.fn('BookmarkRepository.update')(function* (
        input: UpdateBookmarkInput,
    ) {
        const duplicate = yield* d1Store.first(
            CountRow,
            `
                SELECT COUNT(*) AS count
                FROM bookmarks
                WHERE url = ? AND short_url <> ?
            `,
            [input.url, input.shortUrl],
        );
        if ((duplicate?.count ?? 0) > 0) {
            return yield* DuplicateBookmarkError.make({ url: input.url });
        }

        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE bookmarks
                    SET
                        url = ?,
                        title = ?,
                        description = ?,
                        metadata_state = 'pending',
                        metadata_error_code = NULL,
                        metadata_attempted_at = NULL,
                        updated_at = ?
                    WHERE short_url = ? AND deletion_state = 'active'
                `,
                parameters: [
                    input.url,
                    input.title,
                    input.description,
                    input.updatedAt,
                    input.shortUrl,
                ],
            },
            {
                sql: `
                    INSERT INTO outbox (
                        id,
                        bookmark_short_url,
                        kind,
                        state,
                        payload_version,
                        available_at,
                        created_at,
                        updated_at
                    )
                    SELECT ?, ?, 'metadata', 'pending', 1, ?, ?, ?
                    WHERE EXISTS (
                        SELECT 1 FROM bookmarks
                        WHERE short_url = ?
                          AND deletion_state = 'active'
                          AND updated_at = ?
                    )
                `,
                parameters: [
                    `metadata:${input.shortUrl}:${input.updatedAt}`,
                    input.shortUrl,
                    input.updatedAt,
                    input.updatedAt,
                    input.updatedAt,
                    input.shortUrl,
                    input.updatedAt,
                ],
            },
        ]);
        if ((results[0]?.changes ?? 0) === 0) {
            return yield* BookmarkNotFoundError.make({
                shortUrl: input.shortUrl,
            });
        }

        const bookmark = yield* findByShortUrl(input.shortUrl);
        if (bookmark === null) {
            return yield* Effect.die(
                new Error('Updated bookmark could not be loaded.'),
            );
        }
        return bookmark;
    });

    const list = Effect.fn('BookmarkRepository.list')(function* (input: {
        readonly page: number;
        readonly perPage: number;
        readonly query?: string;
    }) {
        const page = Math.max(1, Math.floor(input.page));
        const perPage = Math.min(100, Math.max(1, Math.floor(input.perPage)));
        const offset = (page - 1) * perPage;
        const query = input.query?.trim() ?? '';

        if (query === '') {
            const [count, rows] = yield* Effect.all([
                d1Store.first(
                    CountRow,
                    `
                        SELECT COUNT(*) AS count
                        FROM bookmarks
                        WHERE deletion_state = 'active'
                    `,
                ),
                d1Store.query(
                    Bookmark,
                    `${bookmarkProjection()}
                     WHERE deletion_state = 'active'
                     ORDER BY created_at DESC, id DESC
                     LIMIT ? OFFSET ?`,
                    [perPage, offset],
                ),
            ]);
            const total = count?.count ?? 0;
            return BookmarkPage.make({
                bookmarks: rows.rows,
                page,
                pageCount: Math.max(1, Math.ceil(total / perPage)),
                perPage,
                total,
            });
        }

        const ftsQuery = makeFtsQuery(query);
        const count = yield* d1Store.first(
            CountRow,
            `
                SELECT COUNT(*) AS count
                FROM bookmarks_fts
                JOIN bookmarks AS b ON b.id = bookmarks_fts.rowid
                WHERE bookmarks_fts MATCH ?
                  AND b.deletion_state = 'active'
            `,
            [ftsQuery],
        );
        const rows = yield* d1Store.query(
            Bookmark,
            `
                SELECT
                    b.id,
                    b.short_url AS "shortUrl",
                    b.shaarli_short_url AS "shaarliShortUrl",
                    b.url,
                    b.title,
                    b.description,
                    b.thumbnail_url AS "thumbnailUrl",
                    b.thumbnail_key AS "thumbnailKey",
                    b.thumbnail_cleanup_key AS "thumbnailCleanupKey",
                    b.thumbnail_sha256 AS "thumbnailSha256",
                    b.deletion_state AS "deletionState",
                    b.created_at AS "createdAt",
                    b.updated_at AS "updatedAt"
                FROM bookmarks_fts
                JOIN bookmarks AS b ON b.id = bookmarks_fts.rowid
                WHERE bookmarks_fts MATCH ?
                  AND b.deletion_state = 'active'
                ORDER BY bm25(bookmarks_fts), b.created_at DESC, b.id DESC
                LIMIT ? OFFSET ?
            `,
            [ftsQuery, perPage, offset],
        );
        const total = count?.count ?? 0;
        return BookmarkPage.make({
            bookmarks: rows.rows,
            page,
            pageCount: Math.max(1, Math.ceil(total / perPage)),
            perPage,
            total,
        });
    });

    const listForFeed = Effect.fn('BookmarkRepository.listForFeed')(function* (
        limit: number,
    ) {
        const result = yield* d1Store.query(
            Bookmark,
            `${bookmarkProjection()}
                 WHERE deletion_state = 'active'
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?`,
            [Math.max(1, Math.floor(limit))],
        );
        return result.rows;
    });

    const latestUpdatedAt = d1Store
        .first(
            class LatestUpdatedRow extends Schema.Class<LatestUpdatedRow>(
                'LatestUpdatedRow',
            )({ value: Schema.NullOr(Schema.Number) }) {},
            `
                SELECT MAX(updated_at) AS value
                FROM bookmarks
                WHERE deletion_state = 'active'
            `,
        )
        .pipe(
            Effect.map((row) => row?.value ?? null),
            Effect.withSpan('BookmarkRepository.latestUpdatedAt'),
        );

    const removeAll = Effect.fn('BookmarkRepository.removeAll')(function* (
        now: number,
    ) {
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE bookmarks
                    SET deletion_state = 'pending', updated_at = ?
                    WHERE deletion_state = 'active'
                `,
                parameters: [now],
            },
            {
                sql: `
                    INSERT OR IGNORE INTO outbox (
                        id, bookmark_short_url, kind, state,
                        payload_version, created_at, updated_at
                    )
                    SELECT
                        'thumbnail-delete:' || short_url || ':1',
                        short_url,
                        'thumbnail_delete',
                        'pending',
                        1,
                        ?,
                        ?
                    FROM bookmarks
                    WHERE deletion_state = 'pending'
                `,
                parameters: [now, now],
            },
        ]);
        return results[0]?.changes ?? 0;
    });

    const remove = Effect.fn('BookmarkRepository.remove')(function* (
        shortUrl: string,
    ) {
        const bookmark = yield* findByShortUrl(shortUrl);
        if (bookmark === null) {
            return false;
        }
        if (
            bookmark.thumbnailKey === null &&
            bookmark.thumbnailCleanupKey === null
        ) {
            const result = yield* d1Store.run(
                'DELETE FROM bookmarks WHERE short_url = ?',
                [shortUrl],
            );
            return result.changes > 0;
        }

        const now = Date.now() * 1_000;
        yield* d1Store.batch([
            {
                sql: `
                    UPDATE bookmarks
                    SET deletion_state = 'pending', updated_at = ?
                    WHERE short_url = ? AND deletion_state = 'active'
                `,
                parameters: [now, shortUrl],
            },
            {
                sql: `
                    INSERT INTO outbox (
                        id,
                        bookmark_short_url,
                        kind,
                        state,
                        payload_version,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, 'thumbnail_delete', 'pending', 1, ?, ?)
                `,
                parameters: [
                    `thumbnail-delete:${shortUrl}:1`,
                    shortUrl,
                    now,
                    now,
                ],
            },
        ]);
        return true;
    });

    return {
        create,
        findByShaarliHash,
        findByShortUrl,
        findByUrl,
        list,
        listForFeed,
        latestUpdatedAt,
        remove,
        removeAll,
        update,
    };
}
