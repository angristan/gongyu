import { SettingsRepository } from '@gongyu/data/settings-repository';
import { Settings, type TwitterDeliveryMode } from '@gongyu/domain/settings';
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
import { matchesFormSubmission } from '../form-navigation';
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

function twitterDeliveryModeValue(
    formData: FormData,
): TwitterDeliveryMode | null {
    const value = formData.get('twitter_delivery_mode');
    return value === 'api' || value === 'manual' || value === 'disabled'
        ? value
        : null;
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
    const twitterDeliveryMode = twitterDeliveryModeValue(formData);
    const values = {
        blueskyAppPassword: stringValue(formData, 'bluesky_app_password'),
        feedCount,
        blueskyHandle: stringValue(formData, 'bluesky_handle'),
        libraryName: stringValue(formData, 'library_name'),
        mastodonAccessToken: stringValue(formData, 'mastodon_access_token'),
        mastodonInstance: stringValue(formData, 'mastodon_instance'),
        twitterAccessSecret: stringValue(formData, 'twitter_access_secret'),
        twitterAccessToken: stringValue(formData, 'twitter_access_token'),
        twitterApiKey: stringValue(formData, 'twitter_api_key'),
        twitterApiSecret: stringValue(formData, 'twitter_api_secret'),
        twitterDeliveryMode: twitterDeliveryMode ?? 'disabled',
    };
    const errors: Record<string, string> = {};
    if (twitterDeliveryMode === null) {
        errors.twitter_delivery_mode = 'Choose a Twitter delivery mode.';
    } else if (
        twitterDeliveryMode === 'api' &&
        fields.slice(0, 4).some((field) => values[field.key] === '')
    ) {
        errors.twitter_delivery_mode =
            'Enter all four API credentials or choose manual or disabled.';
    }
    if (values.libraryName === '') {
        errors.library_name = 'Enter a library name.';
    } else if (values.libraryName.length > 80) {
        errors.library_name = 'Use 80 characters or fewer.';
    }
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
    const isSubmitting = matchesFormSubmission(useNavigation(), {
        action: '/admin/settings',
        method: 'POST',
    });
    const providerGroups = [
        {
            description:
                'Choose API automation, a manual X composer, or no delivery.',
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
            description="Configure the public library, social sharing, and Atom feed."
            title="Settings"
        >
            {loaderData.saved ? (
                <Banner
                    description="Your public library and delivery settings have been updated."
                    title="Settings saved"
                    variant="secondary"
                />
            ) : null}
            <Form method="post">
                <input name="_csrf" type="hidden" value={csrfToken} />
                <LayerCard className="overflow-hidden">
                    <div className="divide-y divide-gongyu-line">
                        <section className="p-4">
                            <div className="mb-3">
                                <h2 className="font-semibold text-gongyu-default">
                                    Public library
                                </h2>
                                <p className="mt-0.5 text-sm text-gongyu-subtle">
                                    Name shown as the public homepage heading.
                                </p>
                            </div>
                            <Input
                                className="max-w-sm"
                                defaultValue={values.libraryName}
                                error={errors.library_name}
                                label="Library name"
                                maxLength={80}
                                name="library_name"
                            />
                        </section>
                        {providerGroups.map((provider) => {
                            const credentialsConfigured = provider.fields.every(
                                (field) =>
                                    String(values[field.key]).trim() !== '',
                            );
                            const isTwitter = provider.name === 'Twitter';
                            const configured = isTwitter
                                ? values.twitterDeliveryMode === 'manual' ||
                                  (values.twitterDeliveryMode === 'api' &&
                                      credentialsConfigured)
                                : credentialsConfigured;
                            const status = isTwitter
                                ? values.twitterDeliveryMode === 'manual'
                                    ? 'Manual composer'
                                    : values.twitterDeliveryMode === 'disabled'
                                      ? 'Disabled'
                                      : credentialsConfigured
                                        ? 'API configured'
                                        : 'API incomplete'
                                : configured
                                  ? 'Configured'
                                  : 'Not configured';
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
                                            {status}
                                        </Badge>
                                    </div>
                                    {isTwitter ? (
                                        <fieldset
                                            aria-describedby={
                                                errors.twitter_delivery_mode ===
                                                undefined
                                                    ? undefined
                                                    : 'twitter-delivery-mode-error'
                                            }
                                            className="mb-4"
                                        >
                                            <legend className="mb-2 text-sm font-medium text-gongyu-default">
                                                Delivery mode
                                            </legend>
                                            <div className="grid gap-2 sm:grid-cols-3">
                                                {[
                                                    {
                                                        description:
                                                            'Queue posts through the paid X API.',
                                                        label: 'API automation',
                                                        value: 'api',
                                                    },
                                                    {
                                                        description:
                                                            'Offer a prefilled X composer after saving.',
                                                        label: 'Manual composer',
                                                        value: 'manual',
                                                    },
                                                    {
                                                        description:
                                                            'Do not offer or send posts to X.',
                                                        label: 'Disabled',
                                                        value: 'disabled',
                                                    },
                                                ].map((option) => (
                                                    <label
                                                        className="flex cursor-pointer gap-2 rounded-lg border border-gongyu-line p-3"
                                                        key={option.value}
                                                    >
                                                        <input
                                                            defaultChecked={
                                                                values.twitterDeliveryMode ===
                                                                option.value
                                                            }
                                                            name="twitter_delivery_mode"
                                                            type="radio"
                                                            value={option.value}
                                                        />
                                                        <span>
                                                            <span className="block text-sm font-medium text-gongyu-default">
                                                                {option.label}
                                                            </span>
                                                            <span className="mt-0.5 block text-xs leading-5 text-gongyu-subtle">
                                                                {
                                                                    option.description
                                                                }
                                                            </span>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                            {errors.twitter_delivery_mode ===
                                            undefined ? null : (
                                                <p
                                                    className="mt-2 text-sm text-gongyu-danger"
                                                    id="twitter-delivery-mode-error"
                                                >
                                                    {
                                                        errors.twitter_delivery_mode
                                                    }
                                                </p>
                                            )}
                                            <p className="mt-3 text-xs text-gongyu-subtle">
                                                Credentials below are used only
                                                for API automation.
                                            </p>
                                        </fieldset>
                                    ) : null}
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
