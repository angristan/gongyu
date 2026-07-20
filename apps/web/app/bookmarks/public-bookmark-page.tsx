import {
    ArrowRightIcon,
    BookmarkSimpleIcon,
    MagnifyingGlassIcon,
    XIcon,
} from '@phosphor-icons/react';
import { Form, Link } from 'react-router';
import {
    Badge,
    Button,
    cn,
    Empty,
    Input,
    LayerCard,
    LinkButton,
} from '../components/ui';
import { type BookmarkView, BookmarkViewSwitch } from './bookmark-view-switch';

interface PublicBookmark {
    readonly createdAt: number;
    readonly description: string | null;
    readonly id: number;
    readonly shortUrl: string;
    readonly thumbnailSha256: string | null;
    readonly title: string;
    readonly url: string;
}

interface PublicBookmarkPageProps {
    readonly basePath: string;
    readonly query: string;
    readonly result: {
        readonly bookmarks: ReadonlyArray<PublicBookmark>;
        readonly page: number;
        readonly pageCount: number;
        readonly perPage: number;
        readonly total: number;
    };
    readonly view: BookmarkView;
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

function pageHref(
    basePath: string,
    query: string,
    page: number,
    view: BookmarkView,
): string {
    const parameters = new URLSearchParams();
    if (query !== '') {
        parameters.set('q', query);
    }
    parameters.set('page', String(page));
    parameters.set('view', view);
    return `${basePath}?${parameters.toString()}`;
}

function BookmarkCard({ bookmark }: { readonly bookmark: PublicBookmark }) {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./u, '');
    return (
        <LayerCard className="group h-full overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
            <article className="flex h-full flex-col">
                <Link
                    aria-label={`View details for ${bookmark.title}`}
                    className="relative block aspect-[16/10] overflow-hidden bg-gongyu-tint"
                    to={`/b/${bookmark.shortUrl}`}
                >
                    {bookmark.thumbnailSha256 === null ? (
                        <span className="flex size-full items-center justify-center">
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                className="text-gongyu-subtle/50 transition-transform duration-300 group-hover:scale-110"
                                size={40}
                                weight="duotone"
                            />
                        </span>
                    ) : (
                        <img
                            alt=""
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                            src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                        />
                    )}
                </Link>
                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <Badge variant="secondary">{hostname}</Badge>
                            <time
                                className="shrink-0 text-xs text-gongyu-subtle"
                                dateTime={new Date(
                                    bookmark.createdAt / 1_000,
                                ).toISOString()}
                            >
                                {formatDate(bookmark.createdAt)}
                            </time>
                        </div>
                        <div className="space-y-1.5">
                            <h2 className="text-sm font-semibold leading-snug tracking-[-0.01em] text-gongyu-default">
                                <a
                                    className="decoration-gongyu-line underline-offset-4 hover:text-gongyu-link hover:underline"
                                    href={bookmark.url}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    {bookmark.title}
                                </a>
                            </h2>
                            {bookmark.description === null ? null : (
                                <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-gongyu-subtle">
                                    {bookmark.description}
                                </p>
                            )}
                        </div>
                    </div>
                    <Link
                        className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-gongyu-link"
                        to={`/b/${bookmark.shortUrl}`}
                    >
                        Notes and details
                        <ArrowRightIcon aria-hidden="true" size={15} />
                    </Link>
                </div>
            </article>
        </LayerCard>
    );
}

function BookmarkListItem({ bookmark }: { readonly bookmark: PublicBookmark }) {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./u, '');
    return (
        <LayerCard className="transition-shadow hover:shadow-md">
            <article className="flex items-start gap-3 p-3">
                {bookmark.thumbnailSha256 === null ? null : (
                    <Link
                        aria-label={`View details for ${bookmark.title}`}
                        className="h-[3.75rem] w-20 shrink-0 overflow-hidden rounded-md bg-gongyu-tint"
                        to={`/b/${bookmark.shortUrl}`}
                    >
                        <img
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                            src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                        />
                    </Link>
                )}
                <div className="min-w-0 flex-1">
                    <a
                        className="block truncate text-sm font-semibold text-gongyu-default hover:text-gongyu-link hover:underline"
                        href={bookmark.url}
                        rel="noreferrer"
                        target="_blank"
                    >
                        {bookmark.title}
                    </a>
                    {bookmark.description === null ? null : (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gongyu-subtle">
                            {bookmark.description}
                        </p>
                    )}
                    <div className="mt-1.5 flex min-w-0 items-center gap-2">
                        <Badge variant="secondary">{hostname}</Badge>
                        <Link
                            className="truncate text-[11px] text-gongyu-subtle hover:text-gongyu-link"
                            to={`/b/${bookmark.shortUrl}`}
                        >
                            {formatDate(bookmark.createdAt)}
                        </Link>
                    </div>
                </div>
            </article>
        </LayerCard>
    );
}

function BookmarkPagination({
    basePath,
    page,
    pageCount,
    query,
    total,
    view,
}: {
    readonly basePath: string;
    readonly page: number;
    readonly pageCount: number;
    readonly query: string;
    readonly total: number;
    readonly view: BookmarkView;
}) {
    if (pageCount <= 1) {
        return null;
    }
    return (
        <nav
            aria-label="Bookmark pages"
            className="flex flex-col gap-2 border-t border-gongyu-line pt-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="text-xs text-gongyu-subtle">
                Page <strong className="text-gongyu-default">{page}</strong> of{' '}
                {pageCount} · {total} bookmarks
            </p>
            <div className="flex items-center gap-2">
                <LinkButton
                    aria-disabled={page <= 1}
                    className={cn(
                        page <= 1 && 'pointer-events-none opacity-50',
                    )}
                    href={pageHref(basePath, query, page - 1, view)}
                    size="sm"
                    tabIndex={page <= 1 ? -1 : undefined}
                    variant="secondary"
                >
                    Previous
                </LinkButton>
                <LinkButton
                    aria-disabled={page >= pageCount}
                    className={cn(
                        page >= pageCount && 'pointer-events-none opacity-50',
                    )}
                    href={pageHref(basePath, query, page + 1, view)}
                    size="sm"
                    tabIndex={page >= pageCount ? -1 : undefined}
                    variant="secondary"
                >
                    Next
                </LinkButton>
            </div>
        </nav>
    );
}

export function PublicBookmarkPage({
    basePath,
    query,
    result,
    view,
}: PublicBookmarkPageProps) {
    const hasQuery = query !== '';
    return (
        <main
            className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5"
            id="main-content"
            tabIndex={-1}
        >
            {hasQuery ? (
                <header>
                    <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-gongyu-default">
                        Results for “{query}”
                    </h1>
                    <p className="mt-0.5 text-xs text-gongyu-subtle">
                        {result.total}{' '}
                        {result.total === 1 ? 'bookmark' : 'bookmarks'}
                    </p>
                </header>
            ) : (
                <header>
                    <h1 className="sr-only">Bookmarks</h1>
                    <p className="text-sm text-gongyu-subtle">
                        A simple bookmark manager
                    </p>
                </header>
            )}

            <section
                aria-label="Search and view options"
                className="flex items-center gap-2"
            >
                <Form
                    action="/search"
                    className="flex min-w-0 flex-1 gap-2"
                    method="get"
                >
                    <input name="view" type="hidden" value={view} />
                    <Input
                        aria-label="Search bookmarks"
                        className="min-w-0 flex-1"
                        defaultValue={query}
                        leftSection={
                            <MagnifyingGlassIcon aria-hidden="true" size={16} />
                        }
                        name="q"
                        placeholder="Search bookmarks…"
                        type="search"
                    />
                    <Button size="sm" type="submit" variant="secondary">
                        <span className="hidden sm:inline">Search</span>
                        <MagnifyingGlassIcon
                            aria-hidden="true"
                            className="sm:hidden"
                            size={16}
                        />
                    </Button>
                </Form>
                <BookmarkViewSwitch
                    basePath={basePath}
                    query={query}
                    view={view}
                />
            </section>

            {result.bookmarks.length === 0 ? (
                <LayerCard>
                    <Empty
                        contents={
                            hasQuery ? (
                                <LinkButton
                                    href={`/?view=${view}`}
                                    icon={XIcon}
                                    variant="secondary"
                                >
                                    Clear search
                                </LinkButton>
                            ) : undefined
                        }
                        description={
                            hasQuery
                                ? 'Try a broader phrase, a domain name, or part of the URL.'
                                : 'Saved links will appear here.'
                        }
                        icon={
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                size={40}
                                weight="duotone"
                            />
                        }
                        title={
                            hasQuery
                                ? 'No matching bookmarks'
                                : 'No bookmarks yet'
                        }
                    />
                </LayerCard>
            ) : view === 'gallery' ? (
                <section aria-label="Bookmarks in gallery view">
                    <ol
                        aria-label="Bookmarks in gallery view"
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                        {result.bookmarks.map((bookmark) => (
                            <li key={bookmark.id}>
                                <BookmarkCard bookmark={bookmark} />
                            </li>
                        ))}
                    </ol>
                </section>
            ) : (
                <ol aria-label="Bookmarks in list view" className="space-y-2">
                    {result.bookmarks.map((bookmark) => (
                        <li key={bookmark.id}>
                            <BookmarkListItem bookmark={bookmark} />
                        </li>
                    ))}
                </ol>
            )}

            <BookmarkPagination
                basePath={basePath}
                page={result.page}
                pageCount={result.pageCount}
                query={query}
                total={result.total}
                view={view}
            />
        </main>
    );
}
