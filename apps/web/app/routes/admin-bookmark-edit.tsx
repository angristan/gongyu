import { Badge } from '@cloudflare/kumo/components/badge';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input, InputArea } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { MetadataRepository } from '@gongyu/data/metadata-repository';
import {
    BookmarkNotFoundError,
    BookmarkValidationError,
    DuplicateBookmarkError,
    decodeBookmarkInput,
} from '@gongyu/domain/bookmarks';
import { R2Store } from '@gongyu/integrations/r2-store';
import {
    ArrowSquareOutIcon,
    FloppyDiskIcon,
    SparkleIcon,
    TrashIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { useState } from 'react';
import {
    data,
    Form,
    redirect,
    useNavigation,
    useRouteLoaderData,
} from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import {
    type MetadataCandidates,
    MetadataPreview,
} from '../bookmarks/metadata-preview';
import { AdminPage } from '../components/admin-page';
import {
    adminNativeControlClass,
    adminPanelBodyClass,
    adminPanelFooterClass,
} from '../components/admin-panel';
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
        requireWritable: true,
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
                const bookmark = yield* bookmarks.findByShortUrl(shortUrl);
                if (bookmark === null) {
                    return false;
                }
                const removed = yield* bookmarks.remove(shortUrl);
                if (removed && bookmark.thumbnailKey !== null) {
                    const r2 = yield* R2Store;
                    yield* r2.delete(bookmark.thumbnailKey);
                    const metadata = yield* MetadataRepository;
                    yield* metadata.finalizeDeletion(shortUrl);
                }
                return removed;
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
    const isSubmitting = useNavigation().state !== 'idle';
    const values =
        actionData !== undefined && 'input' in actionData
            ? actionData.input
            : loaderData.bookmark;
    const errors = actionData?.errors ?? {};
    const urlError = 'url' in errors ? errors.url : undefined;
    const titleError = 'title' in errors ? errors.title : undefined;
    const confirmationError =
        'confirmation' in errors ? errors.confirmation : undefined;
    const [url, setUrl] = useState(values.url);
    const [title, setTitle] = useState(values.title);
    const [description, setDescription] = useState(values.description ?? '');
    const [candidates, setCandidates] = useState<MetadataCandidates | null>(
        null,
    );
    const hostname = new URL(loaderData.bookmark.url).hostname.replace(
        /^www\./u,
        '',
    );
    const savedDate = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(loaderData.bookmark.createdAt / 1_000));
    return (
        <AdminPage
            actions={
                <LinkButton
                    external
                    href={loaderData.bookmark.url}
                    icon={ArrowSquareOutIcon}
                    size="sm"
                    variant="secondary"
                >
                    Open original
                </LinkButton>
            }
            description="Update the saved context without changing its stable public address."
            section="Bookmarks"
            sectionHref="/admin/bookmarks"
            title="Edit bookmark"
            width="wide"
        >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)]">
                <LayerCard>
                    <Form method="post">
                        <div className={adminPanelBodyClass}>
                            <input
                                name="_csrf"
                                type="hidden"
                                value={csrfToken}
                            />
                            <input name="intent" type="hidden" value="update" />
                            <Input
                                description="Changing the URL triggers fresh metadata enrichment."
                                error={urlError}
                                label="URL"
                                maxLength={2048}
                                name="url"
                                onChange={(event) =>
                                    setUrl(event.currentTarget.value)
                                }
                                required
                                type="url"
                                value={url}
                            />
                            <MetadataPreview
                                csrfToken={csrfToken}
                                onCandidates={setCandidates}
                                url={url}
                            />
                            {candidates === null ? null : (
                                <div className="rounded-lg border border-kumo-line p-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-kumo-default">
                                        <SparkleIcon
                                            aria-hidden="true"
                                            size={17}
                                        />
                                        Suggestions are ready
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {candidates.title === null ? null : (
                                            <Button
                                                onClick={() =>
                                                    setTitle(
                                                        candidates.title ??
                                                            title,
                                                    )
                                                }
                                                size="sm"
                                                type="button"
                                                variant="secondary"
                                            >
                                                Use suggested title
                                            </Button>
                                        )}
                                        {candidates.description ===
                                        null ? null : (
                                            <Button
                                                onClick={() =>
                                                    setDescription(
                                                        candidates.description ??
                                                            description,
                                                    )
                                                }
                                                size="sm"
                                                type="button"
                                                variant="secondary"
                                            >
                                                Use suggested notes
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <Input
                                error={titleError}
                                label="Title"
                                maxLength={500}
                                name="title"
                                onChange={(event) =>
                                    setTitle(event.currentTarget.value)
                                }
                                required
                                value={title}
                            />
                            <InputArea
                                className="min-h-28"
                                description="Keep the details that make this link worth returning to."
                                label="Description"
                                name="description"
                                onChange={(event) =>
                                    setDescription(event.currentTarget.value)
                                }
                                value={description}
                            />
                        </div>
                        <div className={adminPanelFooterClass}>
                            <Button
                                icon={FloppyDiskIcon}
                                loading={isSubmitting}
                                type="submit"
                                variant="primary"
                            >
                                Save changes
                            </Button>
                        </div>
                    </Form>
                </LayerCard>

                <aside className="space-y-3">
                    <LayerCard className="overflow-hidden">
                        {loaderData.bookmark.thumbnailSha256 === null ? (
                            <div className="flex aspect-[16/9] items-center justify-center bg-kumo-tint">
                                <span className="text-sm text-kumo-subtle">
                                    No mirrored preview
                                </span>
                            </div>
                        ) : (
                            <img
                                alt=""
                                className="aspect-[16/9] w-full object-cover"
                                src={`/thumbnails/${loaderData.bookmark.shortUrl}/${loaderData.bookmark.thumbnailSha256}`}
                            />
                        )}
                        <dl className="space-y-3 p-4 text-sm">
                            <div>
                                <dt className="text-kumo-subtle">Source</dt>
                                <dd className="mt-1">
                                    <Badge variant="secondary">
                                        {hostname}
                                    </Badge>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-kumo-subtle">Saved</dt>
                                <dd className="mt-1 font-medium text-kumo-default">
                                    {savedDate}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-kumo-subtle">
                                    Public short URL
                                </dt>
                                <dd className="mt-1 font-mono text-xs text-kumo-default">
                                    /b/{loaderData.bookmark.shortUrl}
                                </dd>
                            </div>
                        </dl>
                    </LayerCard>

                    <details
                        className="border-t border-kumo-line pt-2"
                        open={confirmationError !== undefined}
                    >
                        <summary className="cursor-pointer text-sm text-kumo-danger hover:underline">
                            Delete bookmark
                        </summary>
                        <div className="mt-3 rounded-lg bg-kumo-danger-tint/30 p-3 ring ring-kumo-danger/20">
                            <p className="text-sm leading-6 text-kumo-subtle">
                                Permanently removes this bookmark and its
                                mirrored preview.
                            </p>
                            <Dialog.Root
                                defaultOpen={confirmationError !== undefined}
                                role="alertdialog"
                            >
                                <Dialog.Trigger
                                    render={
                                        <Button
                                            className="mt-3"
                                            icon={TrashIcon}
                                            size="sm"
                                            variant="secondary-destructive"
                                        />
                                    }
                                >
                                    Delete bookmark
                                </Dialog.Trigger>
                                <Dialog className="space-y-5 p-6" size="lg">
                                    <div className="space-y-2">
                                        <Dialog.Title>
                                            Delete this bookmark?
                                        </Dialog.Title>
                                        <Dialog.Description>
                                            Type DELETE to permanently remove “
                                            {loaderData.bookmark.title}”.
                                        </Dialog.Description>
                                    </div>
                                    <Form className="space-y-4" method="post">
                                        <input
                                            name="_csrf"
                                            type="hidden"
                                            value={csrfToken}
                                        />
                                        <input
                                            name="intent"
                                            type="hidden"
                                            value="delete"
                                        />
                                        <Input
                                            error={confirmationError}
                                            label="Confirmation phrase"
                                            name="confirmation"
                                            placeholder="DELETE"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Dialog.Close
                                                render={
                                                    <Button variant="secondary" />
                                                }
                                            >
                                                Cancel
                                            </Dialog.Close>
                                            <Button
                                                loading={isSubmitting}
                                                type="submit"
                                                variant="destructive"
                                            >
                                                Delete permanently
                                            </Button>
                                        </div>
                                    </Form>
                                </Dialog>
                            </Dialog.Root>
                            <noscript>
                                <Form className="mt-4 space-y-3" method="post">
                                    <input
                                        name="_csrf"
                                        type="hidden"
                                        value={csrfToken}
                                    />
                                    <input
                                        name="intent"
                                        type="hidden"
                                        value="delete"
                                    />
                                    <label className="block space-y-2 text-sm text-kumo-default">
                                        <span>Type DELETE to confirm</span>
                                        <input
                                            className={adminNativeControlClass}
                                            name="confirmation"
                                        />
                                    </label>
                                    <Button type="submit" variant="destructive">
                                        Delete permanently
                                    </Button>
                                </Form>
                            </noscript>
                        </div>
                    </details>
                </aside>
            </div>
        </AdminPage>
    );
}
