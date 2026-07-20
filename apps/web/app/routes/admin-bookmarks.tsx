import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import {
    Form,
    Link,
    redirect,
    useNavigation,
    useRouteLoaderData,
} from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
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

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        requireWritable: true,
        runner: effect,
    });
    const formData = await request.formData();
    if (formData.get('confirmation') !== 'DELETE ALL BOOKMARKS') {
        return { error: 'Type DELETE ALL BOOKMARKS to confirm.' };
    }
    await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            yield* bookmarks.removeAll(Date.now() * 1_000);
        }),
    );
    return redirect('/admin/bookmarks?deleted=all');
}

export default function AdminBookmarks({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const isSubmitting = useNavigation().state !== 'idle';
    return (
        <PageShell
            description={`${loaderData.result.total} bookmarks`}
            eyebrow="Administrator"
            footer={
                <div className="flex flex-wrap gap-4">
                    <Link className="text-kumo-link" to="/admin/dashboard">
                        Dashboard
                    </Link>
                    <Link className="text-kumo-link" to="/admin/settings">
                        Settings
                    </Link>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Form
                    className="flex w-full min-w-0 gap-2 sm:flex-1"
                    method="get"
                >
                    <label className="sr-only" htmlFor="bookmark-search">
                        Search bookmarks
                    </label>
                    <input
                        id="bookmark-search"
                        className="min-w-0 flex-1 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
                        defaultValue={loaderData.query}
                        name="q"
                        placeholder="Search bookmarks"
                        type="search"
                    />
                    <Button
                        loading={isSubmitting}
                        type="submit"
                        variant="secondary"
                    >
                        Search
                    </Button>
                </Form>
                <LinkButton href="/admin/bookmarks/new">
                    New bookmark
                </LinkButton>
            </div>

            {loaderData.result.bookmarks.length === 0 ? (
                <LayerCard className="mt-6">
                    <p className="p-6 text-kumo-subtle">No bookmarks found.</p>
                </LayerCard>
            ) : (
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
            )}

            <LayerCard className="mt-8 max-w-3xl">
                <Form className="space-y-4 p-6" method="post">
                    <input name="_csrf" type="hidden" value={csrfToken} />
                    <h2 className="font-semibold text-kumo-default">
                        Delete all bookmarks
                    </h2>
                    <label className="block space-y-2 text-sm font-medium text-kumo-default">
                        <span>Type DELETE ALL BOOKMARKS to confirm</span>
                        <input
                            aria-describedby={
                                actionData?.error === undefined
                                    ? undefined
                                    : 'delete-all-error'
                            }
                            aria-invalid={
                                actionData?.error === undefined
                                    ? undefined
                                    : true
                            }
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            name="confirmation"
                        />
                    </label>
                    {actionData?.error === undefined ? null : (
                        <p
                            className="text-sm text-kumo-danger"
                            id="delete-all-error"
                            role="alert"
                        >
                            {actionData.error}
                        </p>
                    )}
                    <Button
                        loading={isSubmitting}
                        type="submit"
                        variant="destructive"
                    >
                        Delete all bookmarks
                    </Button>
                </Form>
            </LayerCard>

            {loaderData.result.pageCount > 1 ? (
                <nav
                    aria-label="Bookmark pages"
                    className="mt-6 flex items-center gap-4"
                >
                    {loaderData.result.page > 1 ? (
                        <Link
                            className="text-kumo-link"
                            to={`?q=${encodeURIComponent(loaderData.query)}&page=${loaderData.result.page - 1}`}
                        >
                            Previous
                        </Link>
                    ) : null}
                    <span className="text-sm text-kumo-subtle">
                        Page {loaderData.result.page} of{' '}
                        {loaderData.result.pageCount}
                    </span>
                    {loaderData.result.page < loaderData.result.pageCount ? (
                        <Link
                            className="text-kumo-link"
                            to={`?q=${encodeURIComponent(loaderData.query)}&page=${loaderData.result.page + 1}`}
                        >
                            Next
                        </Link>
                    ) : null}
                </nav>
            ) : null}
        </PageShell>
    );
}
