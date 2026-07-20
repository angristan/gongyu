import { Badge } from '@cloudflare/kumo/components/badge';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Empty } from '@cloudflare/kumo/components/empty';
import { Input } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    ArrowRightIcon,
    BookmarkSimpleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    RssSimpleIcon,
    XIcon,
} from '@phosphor-icons/react';
import { Form, Link } from 'react-router';

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
    readonly authenticated: boolean;
    readonly query: string;
    readonly result: {
        readonly bookmarks: ReadonlyArray<PublicBookmark>;
        readonly page: number;
        readonly pageCount: number;
        readonly perPage: number;
        readonly total: number;
    };
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

function pageHref(query: string, page: number): string {
    const parameters = new URLSearchParams();
    if (query !== '') {
        parameters.set('q', query);
    }
    parameters.set('page', String(page));
    return `/search?${parameters.toString()}`;
}

function BookmarkCard({ bookmark }: { readonly bookmark: PublicBookmark }) {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./u, '');
    return (
        <LayerCard className="group h-full overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
            <article className="flex h-full flex-col">
                <Link
                    aria-label={`View details for ${bookmark.title}`}
                    className="relative block aspect-[16/9] overflow-hidden bg-kumo-tint"
                    to={`/b/${bookmark.shortUrl}`}
                >
                    {bookmark.thumbnailSha256 === null ? (
                        <span className="flex size-full items-center justify-center">
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                className="text-kumo-subtle/50 transition-transform duration-300 group-hover:scale-110"
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
                <div className="flex flex-1 flex-col gap-4 p-5">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Badge variant="secondary">{hostname}</Badge>
                            <time
                                className="shrink-0 text-xs text-kumo-subtle"
                                dateTime={new Date(
                                    bookmark.createdAt / 1_000,
                                ).toISOString()}
                            >
                                {formatDate(bookmark.createdAt)}
                            </time>
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-lg font-semibold leading-snug tracking-[-0.015em] text-kumo-default">
                                <a
                                    className="decoration-kumo-line underline-offset-4 hover:text-kumo-link hover:underline"
                                    href={bookmark.url}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    {bookmark.title}
                                </a>
                            </h2>
                            {bookmark.description === null ? null : (
                                <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-kumo-subtle">
                                    {bookmark.description}
                                </p>
                            )}
                        </div>
                    </div>
                    <Link
                        className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-kumo-link"
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

function BookmarkPagination({
    page,
    pageCount,
    query,
    total,
}: {
    readonly page: number;
    readonly pageCount: number;
    readonly query: string;
    readonly total: number;
}) {
    if (pageCount <= 1) {
        return null;
    }
    return (
        <nav
            aria-label="Bookmark pages"
            className="flex flex-col gap-3 border-t border-kumo-line pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="text-sm text-kumo-subtle">
                Page <strong className="text-kumo-default">{page}</strong> of{' '}
                {pageCount} · {total} bookmarks
            </p>
            <div className="flex items-center gap-2">
                <LinkButton
                    aria-disabled={page <= 1}
                    className={
                        page <= 1 ? 'pointer-events-none opacity-50' : ''
                    }
                    href={pageHref(query, page - 1)}
                    size="sm"
                    variant="secondary"
                >
                    Previous
                </LinkButton>
                <LinkButton
                    aria-disabled={page >= pageCount}
                    className={
                        page >= pageCount
                            ? 'pointer-events-none opacity-50'
                            : ''
                    }
                    href={pageHref(query, page + 1)}
                    size="sm"
                    variant="secondary"
                >
                    Next
                </LinkButton>
            </div>
        </nav>
    );
}

export function PublicBookmarkPage({
    authenticated,
    query,
    result,
}: PublicBookmarkPageProps) {
    const hasQuery = query !== '';
    return (
        <PageShell
            actions={
                <>
                    {authenticated ? (
                        <LinkButton
                            href="/admin/bookmarks/new"
                            icon={PlusIcon}
                            variant="primary"
                        >
                            Save a link
                        </LinkButton>
                    ) : null}
                    <LinkButton
                        href="/feed"
                        icon={RssSimpleIcon}
                        variant="secondary"
                    >
                        Follow the feed
                    </LinkButton>
                </>
            }
            description={
                hasQuery
                    ? `${result.total} ${result.total === 1 ? 'result' : 'results'} across titles, notes, and URLs.`
                    : `${result.total} links kept with enough context to find them again.`
            }
            eyebrow={hasQuery ? 'Search results' : 'Personal knowledge library'}
            title={
                hasQuery ? (
                    <>
                        Results for{' '}
                        <span className="text-kumo-link">“{query}”</span>
                    </>
                ) : (
                    'Links worth returning to.'
                )
            }
            width="wide"
        >
            <section
                aria-label="Search bookmarks"
                className="rounded-2xl border border-kumo-line bg-kumo-tint/50 p-3 shadow-sm sm:p-4"
            >
                <Form action="/search" className="flex gap-2" method="get">
                    <div className="relative min-w-0 flex-1">
                        <MagnifyingGlassIcon
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-kumo-subtle"
                            size={18}
                        />
                        <Input
                            aria-label="Search bookmarks"
                            className="w-full pl-10"
                            defaultValue={query}
                            name="q"
                            placeholder="Search titles, notes, or URLs…"
                            size="lg"
                            type="search"
                        />
                    </div>
                    <Button size="lg" type="submit" variant="primary">
                        <span className="hidden sm:inline">Search</span>
                        <MagnifyingGlassIcon
                            aria-hidden="true"
                            className="sm:hidden"
                            size={18}
                        />
                    </Button>
                </Form>
            </section>

            {result.bookmarks.length === 0 ? (
                <LayerCard>
                    <Empty
                        contents={
                            <div className="flex flex-wrap justify-center gap-2">
                                {hasQuery ? (
                                    <LinkButton
                                        href="/"
                                        icon={XIcon}
                                        variant="secondary"
                                    >
                                        Clear search
                                    </LinkButton>
                                ) : authenticated ? (
                                    <LinkButton
                                        href="/admin/bookmarks/new"
                                        icon={PlusIcon}
                                        variant="primary"
                                    >
                                        Save your first link
                                    </LinkButton>
                                ) : null}
                            </div>
                        }
                        description={
                            hasQuery
                                ? 'Try a broader phrase, a domain name, or part of the URL.'
                                : 'Saved links will appear here with notes, source domains, and mirrored previews.'
                        }
                        icon={
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                size={44}
                                weight="duotone"
                            />
                        }
                        title={
                            hasQuery
                                ? 'No matching bookmarks'
                                : 'Your library is ready'
                        }
                    />
                </LayerCard>
            ) : (
                <section aria-label="Bookmarks">
                    <ol className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {result.bookmarks.map((bookmark) => (
                            <li key={bookmark.id}>
                                <BookmarkCard bookmark={bookmark} />
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <BookmarkPagination
                page={result.page}
                pageCount={result.pageCount}
                query={query}
                total={result.total}
            />
        </PageShell>
    );
}
