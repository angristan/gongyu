import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { PageShell } from '@gongyu/ui/page-shell';
import { Form, Link } from 'react-router';
import { loadPublicBookmarks } from '../bookmarks/public.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/search';

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

export default function Home({ loaderData }: Route.ComponentProps) {
    const { query, result } = loaderData;
    return (
        <PageShell
            description={
                query === ''
                    ? `${result.total} saved links, newest first.`
                    : `${result.total} results for “${query}”.`
            }
            eyebrow="Personal bookmarks"
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
                    <p className="p-6 text-kumo-subtle">No bookmarks found.</p>
                </LayerCard>
            ) : (
                <ol className="mt-6 space-y-3">
                    {result.bookmarks.map((bookmark) => (
                        <li key={bookmark.id}>
                            <LayerCard>
                                <article className="space-y-2 p-5">
                                    <h2 className="text-lg font-semibold text-kumo-default">
                                        <Link
                                            className="text-kumo-link"
                                            to={`/b/${bookmark.shortUrl}`}
                                        >
                                            {bookmark.title}
                                        </Link>
                                    </h2>
                                    {bookmark.description === null ? null : (
                                        <p className="whitespace-pre-wrap text-sm text-kumo-subtle">
                                            {bookmark.description}
                                        </p>
                                    )}
                                    <a
                                        className="block truncate text-sm text-kumo-link"
                                        href={bookmark.url}
                                        rel="noreferrer"
                                    >
                                        {bookmark.url}
                                    </a>
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
