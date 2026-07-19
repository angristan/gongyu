import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import { Settings } from '@gongyu/domain/settings';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { data, Form, Link, redirect, useRouteLoaderData } from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-settings';

const fields = [
    { key: 'twitterApiKey', label: 'Twitter API key', name: 'twitter_api_key' },
    {
        key: 'twitterApiSecret',
        label: 'Twitter API secret',
        name: 'twitter_api_secret',
        sensitive: true,
    },
    {
        key: 'twitterAccessToken',
        label: 'Twitter access token',
        name: 'twitter_access_token',
        sensitive: true,
    },
    {
        key: 'twitterAccessSecret',
        label: 'Twitter access secret',
        name: 'twitter_access_secret',
        sensitive: true,
    },
    {
        key: 'mastodonInstance',
        label: 'Mastodon instance URL',
        name: 'mastodon_instance',
    },
    {
        key: 'mastodonAccessToken',
        label: 'Mastodon access token',
        name: 'mastodon_access_token',
        sensitive: true,
    },
    { key: 'blueskyHandle', label: 'Bluesky handle', name: 'bluesky_handle' },
    {
        key: 'blueskyAppPassword',
        label: 'Bluesky app password',
        name: 'bluesky_app_password',
        sensitive: true,
    },
] satisfies ReadonlyArray<{
    readonly key: keyof Settings;
    readonly label: string;
    readonly name: string;
    readonly sensitive?: boolean;
}>;

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Settings · Gongyu' }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    const location = new URL(request.url);
    if (!authentication.authenticated) {
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    const settings = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* SettingsRepository;
            return yield* repository.get;
        }),
    );
    return { settings };
}

function stringValue(formData: FormData, name: string): string {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
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
    const values = {
        blueskyAppPassword: stringValue(formData, 'bluesky_app_password'),
        blueskyHandle: stringValue(formData, 'bluesky_handle'),
        mastodonAccessToken: stringValue(formData, 'mastodon_access_token'),
        mastodonInstance: stringValue(formData, 'mastodon_instance'),
        twitterAccessSecret: stringValue(formData, 'twitter_access_secret'),
        twitterAccessToken: stringValue(formData, 'twitter_access_token'),
        twitterApiKey: stringValue(formData, 'twitter_api_key'),
        twitterApiSecret: stringValue(formData, 'twitter_api_secret'),
    };
    const errors: Record<string, string> = {};
    for (const field of fields) {
        if (values[field.key].length > 255) {
            errors[field.name] = 'Use 255 characters or fewer.';
        }
    }
    if (values.mastodonInstance !== '') {
        try {
            new URL(values.mastodonInstance);
        } catch {
            errors.mastodon_instance = 'Enter a valid Mastodon instance URL.';
        }
    }
    const feedCount = Number.parseInt(stringValue(formData, 'feed_count'), 10);
    if (!Number.isSafeInteger(feedCount) || feedCount < 1) {
        errors.feed_count = 'Enter a positive whole number.';
    }
    if (Object.keys(errors).length > 0) {
        return data({ errors, values }, { status: 400 });
    }

    await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* SettingsRepository;
            yield* repository.save(
                Settings.make({ ...values, feedCount }),
                Date.now() * 1_000,
            );
        }),
    );
    return redirect('/admin/settings?saved=1');
}

export default function AdminSettings({
    actionData,
    loaderData,
}: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const values = actionData?.values ?? loaderData.settings;
    const errors = actionData?.errors ?? {};
    return (
        <PageShell
            description="Credentials are encrypted in D1 and returned only to this authenticated, non-cacheable page."
            eyebrow="Administrator"
            footer={
                <div className="flex flex-wrap gap-4">
                    <Link className="text-kumo-link" to="/admin/bookmarks">
                        Bookmarks
                    </Link>
                    <Link className="text-kumo-link" to="/admin/dashboard">
                        Dashboard
                    </Link>
                </div>
            }
            title="Settings"
            width="wide"
        >
            <LayerCard className="max-w-3xl">
                <Form className="space-y-6 p-6" method="post">
                    <input name="_csrf" type="hidden" value={csrfToken} />
                    <div className="grid gap-5 sm:grid-cols-2">
                        {fields.map((field) => {
                            const error = errors[field.name];
                            return (
                                <label
                                    className="block space-y-2 text-sm font-medium text-kumo-default"
                                    key={field.name}
                                >
                                    <span>{field.label}</span>
                                    <input
                                        autoComplete="off"
                                        className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                                        defaultValue={String(values[field.key])}
                                        maxLength={255}
                                        name={field.name}
                                        type={
                                            field.sensitive === true
                                                ? 'password'
                                                : 'text'
                                        }
                                    />
                                    {error === undefined ? null : (
                                        <span className="text-kumo-danger">
                                            {error}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                    <label className="block max-w-xs space-y-2 text-sm font-medium text-kumo-default">
                        <span>Atom feed item count</span>
                        <input
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            defaultValue={loaderData.settings.feedCount}
                            min={1}
                            name="feed_count"
                            type="number"
                        />
                        {errors.feed_count === undefined ? null : (
                            <span className="text-kumo-danger">
                                {errors.feed_count}
                            </span>
                        )}
                    </label>
                    <Button type="submit">Save settings</Button>
                </Form>
            </LayerCard>
        </PageShell>
    );
}
