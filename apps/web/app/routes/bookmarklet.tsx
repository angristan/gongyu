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
import {
    BookmarkSimpleIcon,
    CheckCircleIcon,
    CopyIcon,
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
import { failure, success } from '../effect/result';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/bookmarklet';

const bookmarkletFields = [
    { label: 'URL', name: 'url', type: 'url' },
    { label: 'Title', name: 'title', type: 'text' },
] satisfies ReadonlyArray<{
    readonly label: string;
    readonly name: 'title' | 'url';
    readonly type: 'text' | 'url';
}>;

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
            title: location.searchParams.get('title') ?? '',
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
    const isSubmitting = useNavigation().state !== 'idle';
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
                section="Bookmarklet"
                title="Install bookmarklet"
            >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                    <LayerCard>
                        <section className="space-y-6 p-5 sm:p-7">
                            <div className="flex items-start gap-4">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-kumo-tint text-kumo-link">
                                    <BookmarkSimpleIcon
                                        aria-hidden="true"
                                        size={26}
                                        weight="duotone"
                                    />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-kumo-default">
                                        Add it to your bookmarks bar
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-kumo-subtle">
                                        Drag the button below into the browser
                                        toolbar, then click it from any page.
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-dashed border-kumo-brand/50 bg-kumo-tint/50 p-8 text-center">
                                <a
                                    className="inline-flex h-11 items-center justify-center rounded-xl bg-kumo-brand px-5 font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                                    href="#bookmarklet-code"
                                    ref={installLink}
                                >
                                    Save to Gongyu
                                </a>
                                <p className="mt-3 text-xs text-kumo-subtle">
                                    Drag this button — do not click it on this
                                    page.
                                </p>
                            </div>
                            <InputArea
                                className="min-h-36 font-mono text-xs"
                                description="Use this when your browser does not support dragging bookmarklets."
                                id="bookmarklet-code"
                                label="Bookmarklet code"
                                readOnly
                                value={loaderData.installCode}
                            />
                        </section>
                    </LayerCard>
                    <aside className="space-y-4">
                        <LayerCard>
                            <ol className="space-y-5 p-5 text-sm">
                                {[
                                    'Show the browser bookmarks bar.',
                                    'Drag “Save to Gongyu” into the bar.',
                                    'Open any article and click the bookmarklet.',
                                ].map((step, index) => (
                                    <li className="flex gap-3" key={step}>
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-kumo-brand text-xs font-semibold text-white">
                                            {index + 1}
                                        </span>
                                        <span className="leading-6 text-kumo-subtle">
                                            {step}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </LayerCard>
                        <Banner
                            description="The popup sends the page URL and selected text only to your own Gongyu deployment."
                            icon={<CopyIcon aria-hidden="true" size={20} />}
                            title="Private by design"
                            variant="secondary"
                        />
                    </aside>
                </div>
            </AdminPage>
        );
    }

    if (loaderData.existing !== null && !saved) {
        return (
            <AdminPage
                description="This exact URL is already in your library."
                section="Bookmarklet"
                title="Already bookmarked"
                width="default"
            >
                <LayerCard>
                    <div className="space-y-5 p-6 sm:p-7">
                        <div className="flex items-start gap-4">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-kumo-tint text-kumo-link">
                                <BookmarkSimpleIcon
                                    aria-hidden="true"
                                    size={23}
                                />
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold text-kumo-default">
                                    {loaderData.existing.title}
                                </p>
                                <p className="mt-1 break-all text-sm text-kumo-subtle">
                                    {loaderData.existing.url}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-kumo-line pt-5">
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
            section="Bookmarklet"
            title={saved ? 'Bookmark saved' : 'Save captured page'}
            width="default"
        >
            <LayerCard className="max-w-2xl">
                {saved ? (
                    <div className="space-y-5 p-7 text-center">
                        <CheckCircleIcon
                            aria-hidden="true"
                            className="mx-auto text-kumo-success"
                            size={48}
                            weight="duotone"
                        />
                        <p aria-live="polite" className="text-kumo-default">
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
                    <Form className="space-y-4 p-6" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="source" type="hidden" value={source} />
                        {bookmarkletFields.map((field) => {
                            const fieldError =
                                field.name === 'url' ? urlError : titleError;
                            return (
                                <Input
                                    error={fieldError}
                                    key={field.name}
                                    label={field.label}
                                    maxLength={
                                        field.name === 'url' ? 2048 : 500
                                    }
                                    name={field.name}
                                    onChange={(event) => {
                                        if (field.name === 'url') {
                                            setUrl(event.currentTarget.value);
                                        } else {
                                            setTitle(event.currentTarget.value);
                                        }
                                    }}
                                    required
                                    type={field.type}
                                    value={field.name === 'url' ? url : title}
                                />
                            );
                        })}
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
                        <InputArea
                            className="min-h-32"
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
                        <div className="flex flex-wrap gap-3">
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
