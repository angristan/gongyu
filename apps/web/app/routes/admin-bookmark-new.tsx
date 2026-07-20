import { Banner } from '@cloudflare/kumo/components/banner';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Checkbox } from '@cloudflare/kumo/components/checkbox';
import { Input, InputArea } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    BookmarkValidationError,
    DuplicateBookmarkError,
    decodeBookmarkInput,
} from '@gongyu/domain/bookmarks';
import { configuredProviders } from '@gongyu/domain/social';
import { ArrowLeftIcon, FloppyDiskIcon } from '@phosphor-icons/react';
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
import { MetadataPreview } from '../bookmarks/metadata-preview';
import { AdminPage } from '../components/admin-page';
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
    const [shareSocial, setShareSocial] = useState(true);
    return (
        <AdminPage
            actions={
                <LinkButton
                    href="/admin/bookmarks"
                    icon={ArrowLeftIcon}
                    variant="secondary"
                >
                    Cancel
                </LinkButton>
            }
            description="Save the URL and the context that will make it useful later."
            section="Bookmarks"
            sectionHref="/admin/bookmarks"
            title="New bookmark"
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                <LayerCard>
                    <Form className="space-y-6 p-5 sm:p-7" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <Input
                            autoFocus
                            description="Use the exact URL you want Gongyu to preserve."
                            error={errors.url}
                            label="URL"
                            maxLength={2048}
                            name="url"
                            onChange={(event) =>
                                setUrl(event.currentTarget.value)
                            }
                            placeholder="https://example.com/article"
                            required
                            size="lg"
                            type="url"
                            value={url}
                        />
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
                        <Input
                            error={titleError}
                            label="Title"
                            maxLength={500}
                            name="title"
                            onChange={(event) =>
                                setTitle(event.currentTarget.value)
                            }
                            placeholder="A clear title for this link"
                            required
                            value={title}
                        />
                        <InputArea
                            className="min-h-36"
                            description="Optional notes, a quote, or why this link matters."
                            label="Description"
                            name="description"
                            onChange={(event) =>
                                setDescription(event.currentTarget.value)
                            }
                            placeholder="Add context for your future self…"
                            value={description}
                        />
                        {loaderData.providers.length === 0 ? null : (
                            <Checkbox
                                checked={shareSocial}
                                label={`Share through ${loaderData.providers.join(', ')}`}
                                name="share_social"
                                onCheckedChange={(checked) =>
                                    setShareSocial(checked)
                                }
                            />
                        )}
                        <div className="flex flex-wrap items-center gap-3 border-t border-kumo-line pt-5">
                            <Button
                                icon={FloppyDiskIcon}
                                loading={isSubmitting}
                                type="submit"
                                variant="primary"
                            >
                                Save bookmark
                            </Button>
                            <p className="text-xs text-kumo-subtle">
                                Metadata and thumbnails continue in the
                                background.
                            </p>
                        </div>
                    </Form>
                </LayerCard>
                <aside className="space-y-4">
                    <Banner
                        description="The title and notes you submit stay authoritative. Suggested metadata only fills empty fields."
                        title="You stay in control"
                        variant="secondary"
                    />
                    <LayerCard>
                        <div className="space-y-3 p-5 text-sm">
                            <h2 className="font-semibold text-kumo-default">
                                What happens next
                            </h2>
                            <ol className="space-y-3 text-kumo-subtle">
                                <li>1. The bookmark is saved immediately.</li>
                                <li>
                                    2. Metadata is fetched with strict URL
                                    safety checks.
                                </li>
                                <li>
                                    3. Safe thumbnails are mirrored to private
                                    storage.
                                </li>
                            </ol>
                        </div>
                    </LayerCard>
                </aside>
            </div>
        </AdminPage>
    );
}
