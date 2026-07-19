import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { Form, Link, redirect, useRouteLoaderData } from 'react-router';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-bookmarks';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Bookmarks · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const location = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const query = location.searchParams.get('q')?.trim() ?? '';
    const pageValue = Number.parseInt(
        location.searchParams.get('page') ?? '1',
        10,
    );
    const page = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.list({ page, perPage: 20, query });
        }),
    );
    return { query, result };
}

export default function AdminBookmarks({ loaderData }: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    return (
        <PageShell
            description={`${loaderData.result.total} bookmarks`}
            eyebrow="Administrator"
            footer={
                <div className="flex flex-wrap gap-4">
                    <Link className="text-kumo-link" to="/admin/security">
                        Security
                    </Link>
                    <Form action="/logout" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <button className="text-kumo-link" type="submit">
                            Sign out
                        </button>
                    </Form>
                </div>
            }
            title="Bookmarks"
            width="wide"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Form className="flex min-w-0 flex-1 gap-2" method="get">
                    <input
                        className="min-w-0 flex-1 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
                        defaultValue={loaderData.query}
                        name="q"
                        placeholder="Search bookmarks"
                        type="search"
                    />
                    <Button type="submit" variant="secondary">
                        Search
                    </Button>
                </Form>
                <LinkButton href="/admin/bookmarks/new">
                    New bookmark
                </LinkButton>
            </div>

            <ol className="mt-6 space-y-3">
                {loaderData.result.bookmarks.map((bookmark) => (
                    <li key={bookmark.id}>
                        <LayerCard>
                            <div className="flex items-start justify-between gap-4 p-5">
                                <div className="min-w-0 space-y-1">
                                    <h2 className="font-semibold text-kumo-default">
                                        {bookmark.title}
                                    </h2>
                                    <p className="truncate text-sm text-kumo-subtle">
                                        {bookmark.url}
                                    </p>
                                </div>
                                <Link
                                    className="shrink-0 text-kumo-link"
                                    to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                >
                                    Edit
                                </Link>
                            </div>
                        </LayerCard>
                    </li>
                ))}
            </ol>
        </PageShell>
    );
}
