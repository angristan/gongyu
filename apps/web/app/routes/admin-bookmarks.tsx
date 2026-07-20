import { Badge } from '@cloudflare/kumo/components/badge';
import { Banner } from '@cloudflare/kumo/components/banner';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Empty } from '@cloudflare/kumo/components/empty';
import { Input } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Table } from '@cloudflare/kumo/components/table';
import { Toolbar } from '@cloudflare/kumo/components/toolbar';
import { cn } from '@cloudflare/kumo/utils';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import {
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    MagnifyingGlassIcon,
    PencilSimpleIcon,
    PlusIcon,
    TrashIcon,
} from '@phosphor-icons/react';
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
import { AdminPage } from '../components/admin-page';
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
    return {
        deletedAll: location.searchParams.get('deleted') === 'all',
        query,
        result,
    };
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
        return { error: 'Type DELETE ALL BOOKMARKS exactly to confirm.' };
    }
    await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            yield* bookmarks.removeAll(Date.now() * 1_000);
        }),
    );
    return redirect('/admin/bookmarks?deleted=all');
}

function formatDate(microseconds: number): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(microseconds / 1_000));
}

function paginationHref(query: string, page: number): string {
    const parameters = new URLSearchParams();
    if (query !== '') {
        parameters.set('q', query);
    }
    parameters.set('page', String(page));
    return `/admin/bookmarks?${parameters.toString()}`;
}

export default function AdminBookmarks({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const isSubmitting = useNavigation().state !== 'idle';
    const { result } = loaderData;
    return (
        <AdminPage
            actions={
                <LinkButton
                    href="/admin/bookmarks/new"
                    icon={PlusIcon}
                    variant="primary"
                >
                    New bookmark
                </LinkButton>
            }
            description={`${result.total.toLocaleString('en-US')} ${result.total === 1 ? 'bookmark' : 'bookmarks'} in your personal library.`}
            section="Bookmarks"
            title="Bookmarks"
        >
            {loaderData.deletedAll ? (
                <Banner
                    description="Background cleanup will remove mirrored thumbnails safely."
                    title="All bookmarks were queued for deletion"
                    variant="secondary"
                />
            ) : null}

            <LayerCard className="overflow-hidden">
                <Toolbar className="flex flex-col gap-3 border-b border-kumo-line p-3 sm:flex-row sm:items-center sm:justify-between">
                    <Form
                        className="flex w-full min-w-0 gap-2 sm:max-w-xl"
                        method="get"
                    >
                        <Input
                            aria-label="Search bookmarks"
                            className="min-w-0 flex-1"
                            defaultValue={loaderData.query}
                            name="q"
                            placeholder="Search titles, notes, or URLs…"
                            type="search"
                        />
                        <Button
                            icon={MagnifyingGlassIcon}
                            loading={isSubmitting}
                            type="submit"
                            variant="secondary"
                        >
                            Search
                        </Button>
                    </Form>
                    {loaderData.query === '' ? null : (
                        <LinkButton
                            href="/admin/bookmarks"
                            size="sm"
                            variant="ghost"
                        >
                            Clear search
                        </LinkButton>
                    )}
                </Toolbar>

                {result.bookmarks.length === 0 ? (
                    <Empty
                        contents={
                            loaderData.query === '' ? (
                                <LinkButton
                                    href="/admin/bookmarks/new"
                                    icon={PlusIcon}
                                    variant="primary"
                                >
                                    Save your first link
                                </LinkButton>
                            ) : (
                                <LinkButton
                                    href="/admin/bookmarks"
                                    variant="secondary"
                                >
                                    Clear search
                                </LinkButton>
                            )
                        }
                        description={
                            loaderData.query === ''
                                ? 'Create a bookmark to start building the library.'
                                : 'Try a broader phrase or search by source domain.'
                        }
                        icon={
                            <BookmarkSimpleIcon
                                aria-hidden="true"
                                size={42}
                                weight="duotone"
                            />
                        }
                        title={
                            loaderData.query === ''
                                ? 'No bookmarks yet'
                                : 'No matching bookmarks'
                        }
                    />
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head>Bookmark</Table.Head>
                                        <Table.Head>Source</Table.Head>
                                        <Table.Head>Saved</Table.Head>
                                        <Table.Head className="w-24 text-right">
                                            Actions
                                        </Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {result.bookmarks.map((bookmark) => {
                                        const hostname = new URL(
                                            bookmark.url,
                                        ).hostname.replace(/^www\./u, '');
                                        return (
                                            <Table.Row key={bookmark.id}>
                                                <Table.Cell>
                                                    <div className="max-w-lg space-y-1">
                                                        <Link
                                                            className="line-clamp-1 font-medium text-kumo-default hover:text-kumo-link"
                                                            to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                                        >
                                                            {bookmark.title}
                                                        </Link>
                                                        {bookmark.description ===
                                                        null ? null : (
                                                            <p className="line-clamp-1 text-xs text-kumo-subtle">
                                                                {
                                                                    bookmark.description
                                                                }
                                                            </p>
                                                        )}
                                                    </div>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <Badge variant="secondary">
                                                        {hostname}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell className="whitespace-nowrap text-sm text-kumo-subtle">
                                                    {formatDate(
                                                        bookmark.createdAt,
                                                    )}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <div className="flex justify-end gap-1">
                                                        <LinkButton
                                                            aria-label={`Open ${bookmark.title}`}
                                                            external
                                                            href={bookmark.url}
                                                            icon={
                                                                ArrowSquareOutIcon
                                                            }
                                                            shape="square"
                                                            size="sm"
                                                            variant="ghost"
                                                        />
                                                        <LinkButton
                                                            aria-label={`Edit ${bookmark.title}`}
                                                            href={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                                            icon={
                                                                PencilSimpleIcon
                                                            }
                                                            shape="square"
                                                            size="sm"
                                                            variant="ghost"
                                                        />
                                                    </div>
                                                </Table.Cell>
                                            </Table.Row>
                                        );
                                    })}
                                </Table.Body>
                            </Table>
                        </div>

                        <ol className="divide-y divide-kumo-line md:hidden">
                            {result.bookmarks.map((bookmark) => (
                                <li className="p-4" key={bookmark.id}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 space-y-2">
                                            <Link
                                                className="line-clamp-2 font-medium text-kumo-default"
                                                to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                            >
                                                {bookmark.title}
                                            </Link>
                                            <p className="truncate text-xs text-kumo-subtle">
                                                {new URL(
                                                    bookmark.url,
                                                ).hostname.replace(
                                                    /^www\./u,
                                                    '',
                                                )}{' '}
                                                ·{' '}
                                                {formatDate(bookmark.createdAt)}
                                            </p>
                                        </div>
                                        <LinkButton
                                            aria-label={`Edit ${bookmark.title}`}
                                            href={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                                            icon={PencilSimpleIcon}
                                            shape="square"
                                            size="sm"
                                            variant="secondary"
                                        />
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </>
                )}
            </LayerCard>

            {result.pageCount > 1 ? (
                <nav
                    aria-label="Bookmark pages"
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                    <p className="text-sm text-kumo-subtle">
                        Page {result.page} of {result.pageCount}
                    </p>
                    <div className="flex gap-2">
                        <LinkButton
                            aria-disabled={result.page <= 1}
                            className={cn(
                                result.page <= 1 &&
                                    'pointer-events-none opacity-50',
                            )}
                            href={paginationHref(
                                loaderData.query,
                                result.page - 1,
                            )}
                            size="sm"
                            tabIndex={result.page <= 1 ? -1 : undefined}
                            variant="secondary"
                        >
                            Previous
                        </LinkButton>
                        <LinkButton
                            aria-disabled={result.page >= result.pageCount}
                            className={cn(
                                result.page >= result.pageCount &&
                                    'pointer-events-none opacity-50',
                            )}
                            href={paginationHref(
                                loaderData.query,
                                result.page + 1,
                            )}
                            size="sm"
                            tabIndex={
                                result.page >= result.pageCount ? -1 : undefined
                            }
                            variant="secondary"
                        >
                            Next
                        </LinkButton>
                    </div>
                </nav>
            ) : null}

            <section className="rounded-2xl border border-kumo-danger/20 bg-kumo-danger-tint/25 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-semibold text-kumo-default">
                            Delete the entire library
                        </h2>
                        <p className="mt-1 text-sm text-kumo-subtle">
                            This queues every bookmark and mirrored thumbnail
                            for permanent deletion.
                        </p>
                    </div>
                    <Dialog.Root
                        defaultOpen={actionData?.error !== undefined}
                        role="alertdialog"
                    >
                        <Dialog.Trigger
                            render={
                                <Button
                                    icon={TrashIcon}
                                    variant="secondary-destructive"
                                />
                            }
                        >
                            Delete all bookmarks
                        </Dialog.Trigger>
                        <Dialog className="space-y-5 p-6" size="lg">
                            <div className="space-y-2">
                                <Dialog.Title>
                                    Delete every bookmark?
                                </Dialog.Title>
                                <Dialog.Description>
                                    This cannot be undone. Type DELETE ALL
                                    BOOKMARKS to confirm.
                                </Dialog.Description>
                            </div>
                            <Form className="space-y-4" method="post">
                                <input
                                    name="_csrf"
                                    type="hidden"
                                    value={csrfToken}
                                />
                                <Input
                                    autoComplete="off"
                                    error={actionData?.error}
                                    label="Confirmation phrase"
                                    name="confirmation"
                                    placeholder="DELETE ALL BOOKMARKS"
                                />
                                <div className="flex justify-end gap-2">
                                    <Dialog.Close
                                        render={<Button variant="secondary" />}
                                    >
                                        Cancel
                                    </Dialog.Close>
                                    <Button
                                        loading={isSubmitting}
                                        type="submit"
                                        variant="destructive"
                                    >
                                        Delete everything
                                    </Button>
                                </div>
                            </Form>
                        </Dialog>
                    </Dialog.Root>
                </div>
                <noscript>
                    <Form className="mt-5 max-w-lg space-y-3" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>Type DELETE ALL BOOKMARKS to confirm</span>
                            <input
                                className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2"
                                name="confirmation"
                            />
                        </label>
                        <Button type="submit" variant="destructive">
                            Delete everything
                        </Button>
                    </Form>
                </noscript>
            </section>
        </AdminPage>
    );
}
