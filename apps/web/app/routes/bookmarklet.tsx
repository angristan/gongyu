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
import { useEffect, useRef } from 'react';
import { data, Form, Link, redirect, useRouteLoaderData } from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
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
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const decoded = yield* decodeBookmarkInput(input);
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.create({
                ...decoded,
                createdAt: Date.now() * 1_000,
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
            <PageShell
                description="Drag this link to your bookmarks bar, then use it on any page to open Gongyu in a 600×500 popup."
                eyebrow="Administrator"
                footer={
                    <Link className="text-kumo-link" to="/admin/dashboard">
                        Back to dashboard
                    </Link>
                }
                title="Install bookmarklet"
            >
                <LayerCard className="max-w-2xl">
                    <div className="space-y-4 p-6">
                        <a
                            className="inline-flex rounded-md border border-kumo-line px-4 py-2 font-medium text-kumo-link"
                            href="#bookmarklet-code"
                            ref={installLink}
                        >
                            Save to Gongyu
                        </a>
                        <p className="text-sm text-kumo-subtle">
                            If dragging is unavailable, copy the generated code
                            from the link address after the page hydrates.
                        </p>
                    </div>
                </LayerCard>
            </PageShell>
        );
    }

    if (loaderData.existing !== null && !saved) {
        return (
            <PageShell
                description={loaderData.existing.url}
                eyebrow="Bookmarklet"
                title="Already bookmarked"
            >
                <LayerCard className="max-w-2xl">
                    <div className="space-y-4 p-6">
                        <p className="font-medium text-kumo-default">
                            {loaderData.existing.title}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Link
                                className="text-kumo-link"
                                to={`/admin/bookmarks/${loaderData.existing.shortUrl}/edit`}
                            >
                                Edit existing bookmark
                            </Link>
                            <button
                                className="text-kumo-link"
                                onClick={() => window.close()}
                                type="button"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </LayerCard>
            </PageShell>
        );
    }

    return (
        <PageShell
            description="Review the captured page details before saving."
            eyebrow="Bookmarklet"
            title={saved ? 'Bookmark saved' : 'Save bookmark'}
        >
            <LayerCard className="max-w-2xl">
                {saved ? (
                    <div className="space-y-4 p-6">
                        <p aria-live="polite" className="text-kumo-default">
                            Saved successfully. This popup will close shortly.
                        </p>
                        <button
                            className="text-kumo-link"
                            onClick={() => window.close()}
                            type="button"
                        >
                            Close now
                        </button>
                    </div>
                ) : (
                    <Form className="space-y-4 p-6" method="post">
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="source" type="hidden" value={source} />
                        {bookmarkletFields.map((field) => (
                            <label
                                className="block space-y-2 text-sm font-medium text-kumo-default"
                                key={field.name}
                            >
                                <span>{field.label}</span>
                                <input
                                    className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                    defaultValue={values[field.name] ?? ''}
                                    maxLength={
                                        field.name === 'url' ? 2048 : 500
                                    }
                                    name={field.name}
                                    required
                                    type={field.type}
                                />
                                {(field.name === 'url'
                                    ? urlError
                                    : titleError) === undefined ? null : (
                                    <span className="text-kumo-danger">
                                        {field.name === 'url'
                                            ? urlError
                                            : titleError}
                                    </span>
                                )}
                            </label>
                        ))}
                        <label className="block space-y-2 text-sm font-medium text-kumo-default">
                            <span>Description</span>
                            <textarea
                                className="min-h-28 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                defaultValue={values.description ?? ''}
                                name="description"
                            />
                        </label>
                        <div className="flex flex-wrap gap-3">
                            <Button type="submit">Save bookmark</Button>
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
        </PageShell>
    );
}
