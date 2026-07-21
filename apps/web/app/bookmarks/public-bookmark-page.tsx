import {
    ArrowRightIcon,
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    MagnifyingGlassIcon,
    XIcon,
} from '@phosphor-icons/react';
import { Form, Link } from 'react-router';
import {
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

function formatCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
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
        <LayerCard className="gongyu-bookmark-card group h-full overflow-hidden">
            <article className="flex h-full flex-col">
                <Link
                    aria-label={`View details for ${bookmark.title}`}
                    className="relative block aspect-video overflow-hidden bg-gongyu-tint"
                    to={`/b/${bookmark.shortUrl}`}
                >
                    {bookmark.thumbnailSha256 === null ? (
                        <span className="flex size-full items-center justify-center">
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                className="text-gongyu-subtle/45"
                                size={36}
                                weight="duotone"
                            />
                        </span>
                    ) : (
                        <img
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                            src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                        />
                    )}
                </Link>
                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-gongyu-subtle">
                        <span className="truncate font-medium">{hostname}</span>
                        <span aria-hidden="true" className="opacity-45">
                            ·
                        </span>
                        <time
                            className="shrink-0"
                            dateTime={new Date(
                                bookmark.createdAt / 1_000,
                            ).toISOString()}
                        >
                            {formatDate(bookmark.createdAt)}
                        </time>
                    </div>
                    <div className="space-y-1.5">
                        <h2 className="line-clamp-2 text-sm font-semibold leading-snug tracking-[-0.01em] text-gongyu-default">
                            <a
                                className="decoration-gongyu-line underline-offset-4 hover:text-gongyu-link hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gongyu-focus"
                                href={bookmark.url}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {bookmark.title}
                                <ArrowSquareOutIcon
                                    aria-hidden="true"
                                    className="ml-1 inline-block align-[-0.1em] text-gongyu-subtle/65"
                                    size={13}
                                />
                            </a>
                        </h2>
                        {bookmark.description === null ? null : (
                            <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-gongyu-subtle">
                                {bookmark.description}
                            </p>
                        )}
                    </div>
                    <Link
                        className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-gongyu-link hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gongyu-focus"
                        to={`/b/${bookmark.shortUrl}`}
                    >
                        Notes and details
                        <ArrowRightIcon aria-hidden="true" size={14} />
                    </Link>
                </div>
            </article>
        </LayerCard>
    );
}

function BookmarkListItem({ bookmark }: { readonly bookmark: PublicBookmark }) {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./u, '');
    return (
        <article className="gongyu-bookmark-row group flex items-start gap-3 px-3 py-3 sm:px-4">
            {bookmark.thumbnailSha256 === null ? null : (
                <Link
                    aria-label={`View details for ${bookmark.title}`}
                    className="h-[3.75rem] w-20 shrink-0 overflow-hidden rounded-md bg-gongyu-tint sm:w-[5.5rem]"
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
                <h2 className="line-clamp-2 text-sm font-semibold leading-snug tracking-[-0.01em] text-gongyu-default">
                    <a
                        className="decoration-gongyu-line underline-offset-4 hover:text-gongyu-link hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gongyu-focus"
                        href={bookmark.url}
                        rel="noreferrer"
                        target="_blank"
                        title={bookmark.url}
                    >
                        {bookmark.title}
                        <ArrowSquareOutIcon
                            aria-hidden="true"
                            className="ml-1 inline-block align-[-0.1em] text-gongyu-subtle/60"
                            size={13}
                        />
                    </a>
                </h2>
                {bookmark.description === null ? null : (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-gongyu-subtle">
                        {bookmark.description}
                    </p>
                )}
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gongyu-subtle">
                    <span className="truncate font-medium">{hostname}</span>
                    <span aria-hidden="true" className="opacity-45">
                        ·
                    </span>
                    <time
                        className="shrink-0"
                        dateTime={new Date(
                            bookmark.createdAt / 1_000,
                        ).toISOString()}
                    >
                        {formatDate(bookmark.createdAt)}
                    </time>
                    <span aria-hidden="true" className="opacity-45">
                        ·
                    </span>
                    <Link
                        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-gongyu-link hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gongyu-focus"
                        to={`/b/${bookmark.shortUrl}`}
                    >
                        Details
                        <ArrowRightIcon aria-hidden="true" size={12} />
                    </Link>
                </div>
            </div>
        </article>
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
                {pageCount} · {formatCount(total)} bookmarks
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
    const bookmarkCount = formatCount(result.total);
    return (
        <main
            className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-4xl flex-col gap-3.5 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5"
            id="main-content"
            tabIndex={-1}
        >
            <header className="border-l-2 border-gongyu-brand/35 pl-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gongyu-link">
                    {hasQuery ? 'Library search' : 'Personal library'}
                </p>
                <h1 className="mt-0.5 break-words text-xl font-semibold leading-tight tracking-[-0.025em] text-gongyu-default sm:text-2xl">
                    {hasQuery
                        ? `Results for “${query}”`
                        : 'Links worth returning to'}
                </h1>
                <p className="mt-1 text-xs leading-5 text-gongyu-subtle">
                    {hasQuery
                        ? `${bookmarkCount} ${result.total === 1 ? 'match' : 'matches'} across titles, notes, and URLs.`
                        : `${bookmarkCount} ${result.total === 1 ? 'bookmark' : 'bookmarks'} saved for later reference.`}
                </p>
            </header>

            <LayerCard className="gongyu-library-toolbar p-2">
                <section
                    aria-label="Search and view options"
                    className="flex items-center gap-2"
                >
                    <Form
                        action="/search"
                        aria-label="Search bookmarks"
                        className="flex min-w-0 flex-1 gap-2"
                        method="get"
                        role="search"
                    >
                        <input name="view" type="hidden" value={view} />
                        <Input
                            aria-label="Search bookmarks"
                            className="min-w-0 flex-1"
                            defaultValue={query}
                            leftSection={
                                <MagnifyingGlassIcon
                                    aria-hidden="true"
                                    size={16}
                                />
                            }
                            name="q"
                            placeholder="Search titles, notes, and URLs…"
                            type="search"
                        />
                        <Button
                            aria-label="Search bookmarks"
                            size="sm"
                            type="submit"
                            variant="primary"
                        >
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
            </LayerCard>

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
                                size={34}
                                weight="duotone"
                            />
                        }
                        size="sm"
                        title={
                            hasQuery
                                ? 'No matching bookmarks'
                                : 'No bookmarks yet'
                        }
                    />
                </LayerCard>
            ) : view === 'gallery' ? (
                <section>
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
                <section>
                    <LayerCard className="gongyu-bookmark-list overflow-hidden">
                        <ol
                            aria-label="Bookmarks in list view"
                            className="divide-y divide-gongyu-line"
                        >
                            {result.bookmarks.map((bookmark) => (
                                <li key={bookmark.id}>
                                    <BookmarkListItem bookmark={bookmark} />
                                </li>
                            ))}
                        </ol>
                    </LayerCard>
                </section>
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
