import { Banner } from '@cloudflare/kumo/components/banner';
import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    RegistrationOptionsEnvelope,
    RegistrationVerificationRequest,
} from '@gongyu/auth/contracts';
import { hasPasskey } from '@gongyu/auth/service';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    FingerprintSimpleIcon,
    KeyIcon,
    ShieldCheckIcon,
} from '@phosphor-icons/react';
import { startRegistration } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useState } from 'react';
import { redirect } from 'react-router';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/setup';

class ApiErrorEnvelope extends Schema.Class<ApiErrorEnvelope>(
    'SetupApiErrorEnvelope',
)({
    error: Schema.Struct({ code: Schema.String, message: Schema.String }),
}) {}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Set up Gongyu' }];
}

export async function loader({ context }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    if (
        authentication.authenticated ||
        (await effect.runPromise(hasPasskey()))
    ) {
        return redirect(
            authentication.authenticated ? '/admin/bookmarks' : '/login',
        );
    }
    return null;
}

async function postJson(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(path, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
        const failure =
            await Schema.decodeUnknownPromise(ApiErrorEnvelope)(payload);
        throw new Error(failure.error.message);
    }
    return payload;
}

export default function Setup() {
    const [bootstrapToken, setBootstrapToken] = useState('');
    const [message, setMessage] = useState(
        'Enter the deployment bootstrap token to register the administrator passkey.',
    );
    const [processing, setProcessing] = useState(false);

    async function register() {
        setProcessing(true);
        setMessage('Waiting for passkey registration…');
        try {
            const envelope = await Schema.decodeUnknownPromise(
                RegistrationOptionsEnvelope,
            )(
                await postJson('/api/passkey/registration/options', {
                    bootstrapToken,
                }),
            );
            const response = await startRegistration({
                optionsJSON: envelope.options,
            });
            await postJson(
                '/api/passkey/registration/verify',
                RegistrationVerificationRequest.make({
                    ceremonyId: envelope.ceremonyId,
                    response,
                }),
            );
            window.location.assign('/admin/bookmarks');
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Passkey registration failed.',
            );
        } finally {
            setProcessing(false);
        }
    }

    return (
        <PageShell
            description="Use the deployment bootstrap token once, then protect the administrator interface with a passkey."
            eyebrow="First-run security"
            title="Make this Gongyu yours."
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
                <LayerCard>
                    <div className="space-y-6 p-6 sm:p-8">
                        <span className="flex size-14 items-center justify-center rounded-2xl bg-kumo-tint text-kumo-link">
                            <KeyIcon
                                aria-hidden="true"
                                size={30}
                                weight="duotone"
                            />
                        </span>
                        <div>
                            <h2 className="text-xl font-semibold text-kumo-default">
                                Verify deployment access
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-kumo-subtle">
                                Find SETUP_TOKEN in the Worker secret
                                configuration. It is never stored in the browser
                                or database.
                            </p>
                        </div>
                        <Input
                            autoComplete="off"
                            label="Bootstrap token"
                            onChange={(event) =>
                                setBootstrapToken(event.currentTarget.value)
                            }
                            type="password"
                            value={bootstrapToken}
                        />
                        <Button
                            disabled={bootstrapToken.length === 0}
                            icon={FingerprintSimpleIcon}
                            loading={processing}
                            onClick={register}
                            size="lg"
                            type="button"
                            variant="primary"
                        >
                            Register administrator passkey
                        </Button>
                        <p
                            aria-live="polite"
                            className="rounded-xl bg-kumo-tint/60 p-3 text-sm text-kumo-default"
                        >
                            {message}
                        </p>
                    </div>
                </LayerCard>
                <aside className="space-y-4">
                    <Banner
                        description="After successful registration, this setup route closes permanently. Gongyu stores exactly one administrator passkey."
                        icon={<ShieldCheckIcon aria-hidden="true" size={20} />}
                        title="One-time setup"
                        variant="secondary"
                    />
                    <LayerCard>
                        <ol className="space-y-4 p-5 text-sm text-kumo-subtle">
                            <li>1. Enter the deployment token.</li>
                            <li>2. Choose a device or security key.</li>
                            <li>3. Confirm the passkey ceremony.</li>
                        </ol>
                    </LayerCard>
                </aside>
            </div>
            <noscript>
                <Banner
                    description="Passkey registration uses the browser WebAuthn API and cannot continue without JavaScript."
                    title="JavaScript is required for setup"
                    variant="error"
                />
            </noscript>
        </PageShell>
    );
}
