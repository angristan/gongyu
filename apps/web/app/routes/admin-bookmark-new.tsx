import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    BookmarkValidationError,
    DuplicateBookmarkError,
    decodeBookmarkInput,
} from '@gongyu/domain/bookmarks';
import { configuredProviders } from '@gongyu/domain/social';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { useState } from 'react';
import {
    data,
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
import { MetadataPreview } from '../bookmarks/metadata-preview';
import { failure, success } from '../effect/result';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-bookmark-new';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'New bookmark · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    if (!authentication.authenticated) {
        const location = new URL(request.url);
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const providers = await effect.runPromise(
        Effect.gen(function* () {
            const settings = yield* SettingsRepository;
            return configuredProviders(yield* settings.get);
        }),
    );
    return { providers };
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
    const url = formData.get('url');
    const title = formData.get('title');
    const description = formData.get('description');
    const shareSocial = formData.get('share_social') === 'on';
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
            const settings = yield* SettingsRepository;
            const socialProviders = shareSocial
                ? configuredProviders(yield* settings.get)
                : [];
            return yield* bookmarks.create({
                ...decoded,
                createdAt: Date.now() * 1_000,
                socialProviders,
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

export default function AdminBookmarkNew({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const isSubmitting = useNavigation().state !== 'idle';
    const values = actionData?.input ?? {
        description: '',
        title: '',
        url: '',
    };
    const errors = actionData?.errors ?? {};
    const titleError = 'title' in errors ? errors.title : undefined;
    const [url, setUrl] = useState(values.url);
    const [title, setTitle] = useState(values.title);
    const [description, setDescription] = useState(values.description ?? '');
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
                            aria-describedby={
                                errors.url === undefined
                                    ? undefined
                                    : 'url-error'
                            }
                            aria-invalid={
                                errors.url === undefined ? undefined : true
                            }
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            maxLength={2048}
                            name="url"
                            onChange={(event) =>
                                setUrl(event.currentTarget.value)
                            }
                            required
                            type="url"
                            value={url}
                        />
                        {errors.url === undefined ? null : (
                            <span
                                className="text-kumo-danger"
                                id="url-error"
                                role="alert"
                            >
                                {errors.url}
                            </span>
                        )}
                    </label>
                    <MetadataPreview
                        csrfToken={csrfToken}
                        onCandidates={(candidates) => {
                            if (title === '' && candidates.title !== null) {
                                setTitle(candidates.title);
                            }
                            if (
                                description === '' &&
                                candidates.description !== null
                            ) {
                                setDescription(candidates.description);
                            }
                        }}
                        url={url}
                    />
                    <label className="block space-y-2 text-sm font-medium text-kumo-default">
                        <span>Title</span>
                        <input
                            aria-describedby={
                                titleError === undefined
                                    ? undefined
                                    : 'title-error'
                            }
                            aria-invalid={
                                titleError === undefined ? undefined : true
                            }
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            maxLength={500}
                            name="title"
                            onChange={(event) =>
                                setTitle(event.currentTarget.value)
                            }
                            required
                            value={title}
                        />
                        {titleError === undefined ? null : (
                            <span
                                className="text-kumo-danger"
                                id="title-error"
                                role="alert"
                            >
                                {titleError}
                            </span>
                        )}
                    </label>
                    <label className="block space-y-2 text-sm font-medium text-kumo-default">
                        <span>Description</span>
                        <textarea
                            className="min-h-32 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            name="description"
                            onChange={(event) =>
                                setDescription(event.currentTarget.value)
                            }
                            value={description}
                        />
                    </label>
                    {loaderData.providers.length === 0 ? null : (
                        <label className="flex items-center gap-2 text-sm text-kumo-default">
                            <input
                                defaultChecked
                                name="share_social"
                                type="checkbox"
                            />
                            <span>
                                Share through {loaderData.providers.join(', ')}
                            </span>
                        </label>
                    )}
                    <Button loading={isSubmitting} type="submit">
                        Save bookmark
                    </Button>
                </Form>
            </LayerCard>
        </PageShell>
    );
}
