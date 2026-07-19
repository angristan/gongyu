import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import {
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
import type { Route } from './+types/admin-bookmark-new';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'New bookmark · Gongyu' }];
}

export function loader({ context, request }: Route.LoaderArgs) {
    const { authentication } = context.get(cloudflareRequestContext);
    if (!authentication.authenticated) {
        const location = new URL(request.url);
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    return null;
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
        runner: effect,
    });
    const formData = await request.formData();
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
            return yield* bookmarks.create({
                ...decoded,
                createdAt: Date.now() * 1_000,
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

export default function AdminBookmarkNew({ actionData }: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const values = actionData?.input ?? {
        description: '',
        title: '',
        url: '',
    };
    const errors = actionData?.errors ?? {};
    return (
        <PageShell
            description="The submitted title and description remain authoritative. Metadata enrichment runs separately."
            eyebrow="Administrator · Bookmarks"
            footer={
                <Link className="text-kumo-link" to="/admin/bookmarks">
                    Back to bookmarks
                </Link>
            }
            title="New bookmark"
        >
            <LayerCard className="max-w-3xl">
                <Form className="space-y-5 p-6" method="post">
                    <input name="_csrf" type="hidden" value={csrfToken} />
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
                        {errors.url === undefined ? null : (
                            <span className="text-kumo-danger">
                                {errors.url}
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
                    <Button type="submit">Save bookmark</Button>
                </Form>
            </LayerCard>
        </PageShell>
    );
}
