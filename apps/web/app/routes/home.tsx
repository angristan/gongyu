import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { PageShell } from '@gongyu/ui/page-shell';
import { Form, Link, useRouteLoaderData } from 'react-router';
import { loadPublicBookmarks } from '../bookmarks/public.server';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/home';

export function meta(): Route.MetaDescriptors {
    return [
        { title: 'Gongyu' },
        { name: 'description', content: 'Saved links and notes.' },
    ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { effect } = context.get(cloudflareRequestContext);
    return loadPublicBookmarks(effect, request);
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

export default function Home({ loaderData }: Route.ComponentProps) {
    const { query, result } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const currentMode = rootData?.themeMode ?? 'light';
    const nextMode = currentMode === 'light' ? 'dark' : 'light';
    return (
        <PageShell
            description={
                query === ''
                    ? `${result.total} saved links, newest first.`
                    : `${result.total} results for “${query}”.`
            }
            eyebrow="Personal bookmarks"
            footer={
                <div className="flex flex-wrap items-center gap-4">
                    <Link className="text-kumo-link" to="/feed">
                        Atom feed
                    </Link>
                    <Link
                        className="text-kumo-link"
                        to={
                            rootData?.authenticated === true
                                ? '/admin/dashboard'
                                : '/login'
                        }
                    >
                        {rootData?.authenticated === true
                            ? 'Dashboard'
                            : 'Administrator login'}
                    </Link>
                    <Form action="/theme" method="post">
                        <input name="mode" type="hidden" value={nextMode} />
                        <input name="returnTo" type="hidden" value="/" />
                        <button className="text-kumo-link" type="submit">
                            Use {nextMode} mode
                        </button>
                    </Form>
                </div>
            }
            title={query === '' ? 'Gongyu' : 'Search'}
            width="wide"
        >
            <Form className="flex max-w-2xl gap-2" method="get">
                <label className="sr-only" htmlFor="public-search">
                    Search bookmarks
                </label>
                <input
                    className="min-w-0 flex-1 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
                    defaultValue={query}
                    id="public-search"
                    name="q"
                    placeholder="Search title, description, or URL"
                    type="search"
                />
                <Button type="submit">Search</Button>
            </Form>

            {result.bookmarks.length === 0 ? (
                <LayerCard className="mt-6">
                    <p className="p-6 text-kumo-subtle">
                        {query === ''
                            ? 'No bookmarks have been saved yet.'
                            : 'No bookmarks match this search.'}
                    </p>
                </LayerCard>
            ) : (
                <ol className="mt-6 space-y-3">
                    {result.bookmarks.map((bookmark) => (
                        <li key={bookmark.id}>
                            <LayerCard>
                                <article className="space-y-2 p-5">
                                    {bookmark.thumbnailSha256 ===
                                    null ? null : (
                                        <img
                                            alt=""
                                            className="mb-4 max-h-72 w-full rounded-md object-cover"
                                            loading="lazy"
                                            src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                                        />
                                    )}
                                    <h2 className="text-lg font-semibold text-kumo-default">
                                        <a
                                            className="text-kumo-link"
                                            href={bookmark.url}
                                            rel="noreferrer"
                                            target="_blank"
                                        >
                                            {bookmark.title}
                                        </a>
                                    </h2>
                                    {bookmark.description === null ? null : (
                                        <p className="whitespace-pre-wrap text-sm text-kumo-subtle">
                                            {bookmark.description}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-x-3 text-sm text-kumo-subtle">
                                        <span>
                                            {new URL(bookmark.url).hostname}
                                        </span>
                                        <Link
                                            className="text-kumo-link"
                                            to={`/b/${bookmark.shortUrl}`}
                                        >
                                            {formatDate(bookmark.createdAt)}
                                        </Link>
                                    </div>
                                </article>
                            </LayerCard>
                        </li>
                    ))}
                </ol>
            )}

            {result.pageCount > 1 ? (
                <nav
                    aria-label="Bookmark pages"
                    className="mt-6 flex items-center gap-4"
                >
                    {result.page > 1 ? (
                        <Link
                            className="text-kumo-link"
                            to={`?q=${encodeURIComponent(query)}&page=${result.page - 1}`}
                        >
                            Previous
                        </Link>
                    ) : null}
                    <span className="text-sm text-kumo-subtle">
                        Page {result.page} of {result.pageCount}
                    </span>
                    {result.page < result.pageCount ? (
                        <Link
                            className="text-kumo-link"
                            to={`?q=${encodeURIComponent(query)}&page=${result.page + 1}`}
                        >
                            Next
                        </Link>
                    ) : null}
                </nav>
            ) : null}
        </PageShell>
    );
}
