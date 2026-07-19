import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import {
    BookmarkNotFoundError,
    BookmarkValidationError,
    DuplicateBookmarkError,
    decodeBookmarkInput,
} from '@gongyu/domain/bookmarks';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { data, Form, Link, redirect, useRouteLoaderData } from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { failure, success } from '../effect/result';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-bookmark-edit';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
    return [
        {
            title:
                loaderData === undefined
                    ? 'Bookmark · Gongyu'
                    : `Edit ${loaderData.bookmark.title} · Gongyu`,
        },
    ];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const location = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const bookmark = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.findByShortUrl(params.shortUrl ?? '');
        }),
    );
    if (bookmark === null) {
        throw new Response('Bookmark not found', { status: 404 });
    }
    return { bookmark };
}

export async function action({ context, params, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        runner: effect,
    });
    const shortUrl = params.shortUrl ?? '';
    const formData = await request.formData();
    const intent = formData.get('intent');
    if (intent === 'delete') {
        if (formData.get('confirmation') !== 'DELETE') {
            return data(
                { errors: { confirmation: 'Type DELETE to confirm.' } },
                { status: 400 },
            );
        }
        const removed = await effect.runPromise(
            Effect.gen(function* () {
                const bookmarks = yield* BookmarkRepository;
                return yield* bookmarks.remove(shortUrl);
            }),
        );
        if (!removed) {
            throw new Response('Bookmark not found', { status: 404 });
        }
        return redirect('/admin/bookmarks');
    }

    const url = formData.get('url');
    const title = formData.get('title');
    const description = formData.get('description');
    const input = {
        description:
            typeof description === 'string' && description !== ''
                ? description
                : null,
        title: typeof title === 'string' ? title.trim() : '',
        url: typeof url === 'string' ? url : '',
    };
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const decoded = yield* decodeBookmarkInput(input);
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.update({
                ...decoded,
                shortUrl,
                updatedAt: Date.now() * 1_000,
            });
        }).pipe(
            Effect.match({
                onFailure: failure,
                onSuccess: success,
            }),
        ),
    );
    if (result.ok) {
        return redirect('/admin/bookmarks');
    }
    if (result.error instanceof DuplicateBookmarkError) {
        return data(
            { errors: { url: 'This exact URL is already bookmarked.' }, input },
            { status: 409 },
        );
    }
    if (result.error instanceof BookmarkNotFoundError) {
        throw new Response('Bookmark not found', { status: 404 });
    }
    if (result.error instanceof BookmarkValidationError) {
        return data(
            {
                errors: { [result.error.field]: result.error.message },
                input,
            },
            { status: 400 },
        );
    }
    throw result.error;
}

export default function AdminBookmarkEdit({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const values =
        actionData !== undefined && 'input' in actionData
            ? actionData.input
            : loaderData.bookmark;
    const errors = actionData?.errors ?? {};
    const urlError = 'url' in errors ? errors.url : undefined;
    const confirmationError =
        'confirmation' in errors ? errors.confirmation : undefined;
    return (
        <PageShell
            description={`Stable short URL: ${loaderData.bookmark.shortUrl}`}
            eyebrow="Administrator · Bookmarks"
            footer={
                <Link className="text-kumo-link" to="/admin/bookmarks">
                    Back to bookmarks
                </Link>
            }
            title="Edit bookmark"
        >
            <div className="space-y-6">
                <LayerCard className="max-w-3xl">
                    <Form className="space-y-5 p-6" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="intent" type="hidden" value="update" />
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>URL</span>
                            <input
                                className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                defaultValue={values.url}
                                maxLength={2048}
                                name="url"
                                required
                                type="url"
                            />
                            {urlError === undefined ? null : (
                                <span className="text-kumo-danger">
                                    {urlError}
                                </span>
                            )}
                        </label>
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>Title</span>
                            <input
                                className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                defaultValue={values.title}
                                maxLength={500}
                                name="title"
                                required
                            />
                        </label>
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>Description</span>
                            <textarea
                                className="min-h-32 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                defaultValue={values.description ?? ''}
                                name="description"
                            />
                        </label>
                        <Button type="submit">Save changes</Button>
                    </Form>
                </LayerCard>

                <LayerCard className="max-w-3xl">
                    <Form className="space-y-4 p-6" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="intent" type="hidden" value="delete" />
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>
                                Type DELETE to permanently remove this bookmark
                            </span>
                            <input
                                className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                name="confirmation"
                            />
                        </label>
                        {confirmationError === undefined ? null : (
                            <p className="text-kumo-danger">
                                {confirmationError}
                            </p>
                        )}
                        <Button type="submit" variant="destructive">
                            Delete bookmark
                        </Button>
                    </Form>
                </LayerCard>
            </div>
        </PageShell>
    );
}
