import { Effect, Schema } from 'effect';

export const BookmarkUrl = Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(2_048),
);
export const BookmarkTitle = Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500),
);
export const ShortUrl = Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9]{8}$/),
);

export class Bookmark extends Schema.Class<Bookmark>('Bookmark')({
    createdAt: Schema.Number,
    deletionState: Schema.Union([
        Schema.Literal('active'),
        Schema.Literal('pending'),
    ]),
    description: Schema.NullOr(Schema.String),
    id: Schema.Number,
    shaarliShortUrl: Schema.NullOr(Schema.String),
    shortUrl: Schema.String,
    thumbnailKey: Schema.NullOr(Schema.String),
    thumbnailUrl: Schema.NullOr(Schema.String),
    title: Schema.String,
    updatedAt: Schema.Number,
    url: Schema.String,
}) {}

export class BookmarkPage extends Schema.Class<BookmarkPage>('BookmarkPage')({
    bookmarks: Schema.Array(Bookmark),
    page: Schema.Number,
    pageCount: Schema.Number,
    perPage: Schema.Number,
    total: Schema.Number,
}) {}

export class BookmarkInput extends Schema.Class<BookmarkInput>('BookmarkInput')(
    {
        description: Schema.NullOr(Schema.String),
        title: BookmarkTitle,
        url: BookmarkUrl,
    },
) {}

export class BookmarkValidationError extends Schema.TaggedErrorClass<BookmarkValidationError>()(
    'BookmarkValidationError',
    {
        field: Schema.String,
        message: Schema.String,
    },
) {}

export class BookmarkNotFoundError extends Schema.TaggedErrorClass<BookmarkNotFoundError>()(
    'BookmarkNotFoundError',
    { shortUrl: Schema.String },
) {}

export class DuplicateBookmarkError extends Schema.TaggedErrorClass<DuplicateBookmarkError>()(
    'DuplicateBookmarkError',
    { url: Schema.String },
) {}

export type BookmarkDomainError =
    | BookmarkNotFoundError
    | BookmarkValidationError
    | DuplicateBookmarkError;

export const decodeBookmarkInput = Effect.fn('Bookmark.decodeInput')(function* (
    input: unknown,
) {
    const decoded = yield* Schema.decodeUnknownEffect(BookmarkInput)(
        input,
    ).pipe(
        Effect.mapError(() =>
            BookmarkValidationError.make({
                field: 'form',
                message: 'Enter a valid URL, title, and description.',
            }),
        ),
    );

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(decoded.url);
    } catch {
        return yield* BookmarkValidationError.make({
            field: 'url',
            message: 'Enter a valid URL.',
        });
    }

    if (parsedUrl.username !== '' || parsedUrl.password !== '') {
        return yield* BookmarkValidationError.make({
            field: 'url',
            message: 'URLs containing credentials are not allowed.',
        });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return yield* BookmarkValidationError.make({
            field: 'url',
            message: 'Only HTTP and HTTPS URLs are allowed.',
        });
    }

    return decoded;
});
