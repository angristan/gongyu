import { SettingsRepository } from '@gongyu/data/settings-repository';
import { Settings } from '@gongyu/domain/settings';
import {
    AtIcon,
    FloppyDiskIcon,
    GlobeHemisphereWestIcon,
    ShareNetworkIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
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
import { AdminPage } from '../components/admin-page';
import { adminPanelFooterClass } from '../components/admin-panel';
import { Badge, Banner, Button, Input, LayerCard } from '../components/ui';
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
    return {
        saved: location.searchParams.get('saved') === '1',
        settings,
    };
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
        requireWritable: true,
        runner: effect,
    });
    const formData = await request.formData();
    const feedCount = Number.parseInt(stringValue(formData, 'feed_count'), 10);
    const values = {
        blueskyAppPassword: stringValue(formData, 'bluesky_app_password'),
        feedCount,
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
    const isSubmitting = useNavigation().state !== 'idle';
    const providerGroups = [
        {
            description: 'OAuth 1.0a credentials for posting saved links.',
            fields: fields.slice(0, 4),
            icon: ShareNetworkIcon,
            name: 'Twitter',
        },
        {
            description: 'Instance URL and personal access token.',
            fields: fields.slice(4, 6),
            icon: GlobeHemisphereWestIcon,
            name: 'Mastodon',
        },
        {
            description: 'Handle and app-specific password.',
            fields: fields.slice(6, 8),
            icon: AtIcon,
            name: 'Bluesky',
        },
    ] as const;
    return (
        <AdminPage
            description="Configure social delivery and the public feed. Secrets remain encrypted and responses are never cached."
            section="Settings"
            title="Settings"
        >
            {loaderData.saved ? (
                <Banner
                    description="New credentials will be used the next time a delivery is created."
                    title="Settings saved"
                    variant="secondary"
                />
            ) : null}
            <Form className="max-w-5xl" method="post">
                <input name="_csrf" type="hidden" value={csrfToken} />
                <LayerCard className="overflow-hidden">
                    <div className="divide-y divide-gongyu-line">
                        {providerGroups.map((provider) => {
                            const configured = provider.fields.every(
                                (field) =>
                                    String(values[field.key]).trim() !== '',
                            );
                            const Icon = provider.icon;
                            return (
                                <section className="p-4" key={provider.name}>
                                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Icon
                                                aria-hidden="true"
                                                className="text-gongyu-subtle"
                                                size={18}
                                            />
                                            <div>
                                                <h2 className="font-semibold text-gongyu-default">
                                                    {provider.name}
                                                </h2>
                                                <p className="mt-0.5 text-sm text-gongyu-subtle">
                                                    {provider.description}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge
                                            appearance="dot"
                                            variant={
                                                configured
                                                    ? 'success'
                                                    : 'secondary'
                                            }
                                        >
                                            {configured
                                                ? 'Configured'
                                                : 'Not configured'}
                                        </Badge>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {provider.fields.map((field) => {
                                            const error = errors[field.name];
                                            return (
                                                <Input
                                                    autoComplete="off"
                                                    defaultValue={String(
                                                        values[field.key],
                                                    )}
                                                    error={error}
                                                    key={field.name}
                                                    label={field.label}
                                                    maxLength={255}
                                                    name={field.name}
                                                    type={
                                                        field.sensitive === true
                                                            ? 'password'
                                                            : 'text'
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                        <section className="p-4">
                            <div className="mb-3">
                                <h2 className="font-semibold text-gongyu-default">
                                    Public feed
                                </h2>
                                <p className="mt-0.5 text-sm text-gongyu-subtle">
                                    Number of recent bookmarks in the Atom feed.
                                </p>
                            </div>
                            <Input
                                className="max-w-xs"
                                defaultValue={values.feedCount}
                                error={errors.feed_count}
                                label="Feed item count"
                                min={1}
                                name="feed_count"
                                type="number"
                            />
                        </section>
                    </div>
                    <div className={adminPanelFooterClass}>
                        <Button
                            icon={FloppyDiskIcon}
                            loading={isSubmitting}
                            type="submit"
                            variant="primary"
                        >
                            Save settings
                        </Button>
                    </div>
                </LayerCard>
            </Form>
        </AdminPage>
    );
}
