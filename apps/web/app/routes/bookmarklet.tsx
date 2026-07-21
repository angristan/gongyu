import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import {
    BookmarkValidationError,
    DuplicateBookmarkError,
    decodeBookmarkInput,
} from '@gongyu/domain/bookmarks';
import { configuredProviders } from '@gongyu/domain/social';
import { cleanMetadataTitle } from '@gongyu/integrations/metadata-client';
import {
    BookmarkSimpleIcon,
    CheckCircleIcon,
    FloppyDiskIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { useEffect, useRef, useState } from 'react';
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
import {
    adminPanelBodyClass,
    adminPanelFooterClass,
} from '../components/admin-panel';
import {
    Button,
    Checkbox,
    Input,
    InputArea,
    LayerCard,
    LinkButton,
} from '../components/ui';
import { failure, success } from '../effect/result';
import { matchesFormSubmission } from '../form-navigation';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/bookmarklet';

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Bookmarklet · Gongyu' }];
}

function bookmarkletCode(origin: string): string {
    const destination = `${origin}/bookmarklet`;
    return `javascript:(()=>{const u=encodeURIComponent(location.href),t=encodeURIComponent(document.title),d=encodeURIComponent(String(window.getSelection()||''));window.open('${destination}?url='+u+'&title='+t+'&description='+d+'&source=bookmarklet','gongyu','width=600,height=500,resizable=yes,scrollbars=yes')})()`;
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const location = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const url = location.searchParams.get('url') ?? '';
    const providers = await effect.runPromise(
        Effect.gen(function* () {
            const settings = yield* SettingsRepository;
            return configuredProviders(yield* settings.get);
        }),
    );
    const existing =
        url === ''
            ? null
            : await effect.runPromise(
                  Effect.gen(function* () {
                      const bookmarks = yield* BookmarkRepository;
                      return yield* bookmarks.findByUrl(url);
                  }),
              );
    return {
        existing,
        installCode: bookmarkletCode(location.origin),
        prefill: {
            description: location.searchParams.get('description') ?? '',
            source: location.searchParams.get('source') ?? '',
            title: cleanMetadataTitle(location.searchParams.get('title') ?? ''),
            url,
        },
        providers,
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
    const value = (name: string) => {
        const field = formData.get(name);
        return typeof field === 'string' ? field : '';
    };
    const input = {
        description: value('description') === '' ? null : value('description'),
        title: value('title').trim(),
        url: value('url'),
    };
    const source = value('source');
    const shareSocial = formData.get('share_social') === 'on';
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
        }).pipe(Effect.match({ onFailure: failure, onSuccess: success })),
    );
    if (result.ok) {
        return data({ saved: true, source });
    }
    if (result.error instanceof DuplicateBookmarkError) {
        return data(
            {
                errors: { url: 'This exact URL is already bookmarked.' },
                input,
                source,
            },
            { status: 409 },
        );
    }
    if (result.error instanceof BookmarkValidationError) {
        return data(
            {
                errors: { [result.error.field]: result.error.message },
                input,
                source,
            },
            { status: 400 },
        );
    }
    throw result.error;
}

export default function Bookmarklet({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const isSubmitting = matchesFormSubmission(useNavigation(), {
        action: '/bookmarklet',
        method: 'POST',
    });
    const installLink = useRef<HTMLAnchorElement>(null);
    const values =
        actionData !== undefined && 'input' in actionData
            ? actionData.input
            : loaderData.prefill;
    const source = actionData?.source ?? loaderData.prefill.source;
    const errors =
        actionData !== undefined && 'errors' in actionData
            ? actionData.errors
            : {};
    const saved = actionData !== undefined && 'saved' in actionData;
    const urlError = 'url' in errors ? errors.url : undefined;
    const titleError = 'title' in errors ? errors.title : undefined;
    const [url, setUrl] = useState(values.url ?? '');
    const [title, setTitle] = useState(values.title ?? '');
    const [description, setDescription] = useState(values.description ?? '');
    const [shareSocial, setShareSocial] = useState(true);

    useEffect(() => {
        if (installLink.current !== null) {
            installLink.current.href = loaderData.installCode;
        }
    }, [loaderData.installCode]);

    useEffect(() => {
        if (!saved || source !== 'bookmarklet') {
            return;
        }
        const timeout = window.setTimeout(() => window.close(), 1_500);
        return () => window.clearTimeout(timeout);
    }, [saved, source]);

    if (loaderData.prefill.url === '') {
        return (
            <AdminPage
                description="Capture the page you are reading without leaving it."
                title="Install bookmarklet"
            >
                <div className="max-w-3xl">
                    <LayerCard>
                        <section className="space-y-4 p-4">
                            <div className="flex items-start gap-4">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gongyu-tint text-gongyu-link">
                                    <BookmarkSimpleIcon
                                        aria-hidden="true"
                                        size={26}
                                        weight="duotone"
                                    />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-gongyu-default">
                                        Add it to your bookmarks bar
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-gongyu-subtle">
                                        Drag the button below into the browser
                                        toolbar, then click it from any page.
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-lg border border-dashed border-gongyu-line p-5 text-center">
                                <a
                                    className="inline-flex h-11 items-center justify-center rounded-xl bg-gongyu-brand px-5 font-semibold text-gongyu-inverse shadow-sm transition-transform hover:-translate-y-0.5"
                                    href="#bookmarklet-code"
                                    ref={installLink}
                                >
                                    Save to Gongyu
                                </a>
                                <p className="mt-3 text-xs text-gongyu-subtle">
                                    Drag this button — do not click it on this
                                    page.
                                </p>
                            </div>
                            <details className="border-t border-gongyu-line pt-4">
                                <summary className="cursor-pointer text-sm text-gongyu-link">
                                    Manual installation code
                                </summary>
                                <InputArea
                                    className="mt-4 min-h-32 font-mono text-xs"
                                    description="Copy this when dragging bookmarklets is unavailable."
                                    id="bookmarklet-code"
                                    label="Bookmarklet code"
                                    readOnly
                                    value={loaderData.installCode}
                                />
                            </details>
                        </section>
                    </LayerCard>
                </div>
            </AdminPage>
        );
    }

    if (loaderData.existing !== null && !saved) {
        return (
            <AdminPage
                description="This exact URL is already in your library."
                title="Already bookmarked"
            >
                <LayerCard>
                    <div className="space-y-4 p-4">
                        <div className="flex items-start gap-4">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gongyu-tint text-gongyu-link">
                                <BookmarkSimpleIcon
                                    aria-hidden="true"
                                    size={23}
                                />
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold text-gongyu-default">
                                    {loaderData.existing.title}
                                </p>
                                <p className="mt-1 break-all text-sm text-gongyu-subtle">
                                    {loaderData.existing.url}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-gongyu-line pt-3">
                            <LinkButton
                                href={`/admin/bookmarks/${loaderData.existing.shortUrl}/edit`}
                                variant="primary"
                            >
                                Edit existing bookmark
                            </LinkButton>
                            <Button
                                onClick={() => window.close()}
                                type="button"
                                variant="secondary"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </LayerCard>
            </AdminPage>
        );
    }

    return (
        <AdminPage
            description={
                saved
                    ? 'The captured page is now in your library.'
                    : 'Review the page details and keep the context you need.'
            }
            title={saved ? 'Bookmark saved' : 'Save captured page'}
        >
            <LayerCard className="max-w-2xl">
                {saved ? (
                    <div className="space-y-4 p-5 text-center">
                        <CheckCircleIcon
                            aria-hidden="true"
                            className="mx-auto text-gongyu-success"
                            size={48}
                            weight="duotone"
                        />
                        <p aria-live="polite" className="text-gongyu-default">
                            Saved successfully. This popup will close shortly.
                        </p>
                        <Button
                            onClick={() => window.close()}
                            type="button"
                            variant="secondary"
                        >
                            Close now
                        </Button>
                    </div>
                ) : (
                    <Form method="post">
                        <div className={adminPanelBodyClass}>
                            <input
                                name="_csrf"
                                type="hidden"
                                value={csrfToken}
                            />
                            <input name="source" type="hidden" value={source} />
                            <Input
                                description="Use the exact URL you want Gongyu to preserve."
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
                                onCandidates={(candidates) => {
                                    setTitle((current) =>
                                        current === '' &&
                                        candidates.title !== null
                                            ? candidates.title
                                            : current,
                                    );
                                    setDescription((current) =>
                                        current === '' &&
                                        candidates.description !== null
                                            ? candidates.description
                                            : current,
                                    );
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
                                required
                                value={title}
                            />
                            <InputArea
                                className="min-h-28"
                                label="Description"
                                name="description"
                                onChange={(event) =>
                                    setDescription(event.currentTarget.value)
                                }
                                value={description}
                            />
                            {loaderData.providers.length === 0 ? null : (
                                <Checkbox
                                    checked={shareSocial}
                                    label={`Share through ${loaderData.providers.join(', ')}`}
                                    name="share_social"
                                    onCheckedChange={setShareSocial}
                                />
                            )}
                        </div>
                        <div className={adminPanelFooterClass}>
                            <Button
                                icon={FloppyDiskIcon}
                                loading={isSubmitting}
                                type="submit"
                                variant="primary"
                            >
                                Save bookmark
                            </Button>
                            <Button
                                onClick={() => window.close()}
                                type="button"
                                variant="secondary"
                            >
                                Cancel
                            </Button>
                        </div>
                    </Form>
                )}
            </LayerCard>
        </AdminPage>
    );
}
