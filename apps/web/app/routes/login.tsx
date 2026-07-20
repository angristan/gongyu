import { Banner } from '@cloudflare/kumo/components/banner';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    AuthenticationOptionsEnvelope,
    AuthenticationVerificationRequest,
} from '@gongyu/auth/contracts';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    ArrowLeftIcon,
    FingerprintSimpleIcon,
    ShieldCheckIcon,
} from '@phosphor-icons/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useState } from 'react';
import { redirect } from 'react-router';
import { safeReturnTo } from '../auth/bootstrap.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/login';

class ApiErrorEnvelope extends Schema.Class<ApiErrorEnvelope>(
    'LoginApiErrorEnvelope',
)({
    error: Schema.Struct({ code: Schema.String, message: Schema.String }),
}) {}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Sign in · Gongyu' }];
}

export function loader({ context, request }: Route.LoaderArgs) {
    const { authentication } = context.get(cloudflareRequestContext);
    const returnTo = safeReturnTo(
        new URL(request.url).searchParams.get('returnTo'),
    );
    if (authentication.authenticated) {
        return redirect(returnTo);
    }
    return { returnTo };
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

export default function Login({ loaderData }: Route.ComponentProps) {
    const [message, setMessage] = useState(
        'Use the administrator passkey to continue.',
    );
    const [processing, setProcessing] = useState(false);

    async function authenticate() {
        setProcessing(true);
        setMessage('Waiting for your passkey…');
        try {
            const envelope = await Schema.decodeUnknownPromise(
                AuthenticationOptionsEnvelope,
            )(await postJson('/api/passkey/authentication/options', {}));
            const response = await startAuthentication({
                optionsJSON: envelope.options,
            });
            const verification = AuthenticationVerificationRequest.make({
                ceremonyId: envelope.ceremonyId,
                response,
            });
            await postJson('/api/passkey/authentication/verify', verification);
            window.location.assign(loaderData.returnTo);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Passkey authentication failed.',
            );
        } finally {
            setProcessing(false);
        }
    }

    return (
        <PageShell
            actions={
                <LinkButton href="/" icon={ArrowLeftIcon} variant="ghost">
                    Back to library
                </LinkButton>
            }
            description="One passkey protects the entire administrator interface—there is no password to remember or database of user profiles."
            eyebrow="Secure administrator access"
            title="Welcome back."
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
                <LayerCard>
                    <div className="space-y-6 p-6 sm:p-8">
                        <span className="flex size-14 items-center justify-center rounded-2xl bg-kumo-tint text-kumo-link">
                            <FingerprintSimpleIcon
                                aria-hidden="true"
                                size={32}
                                weight="duotone"
                            />
                        </span>
                        <div>
                            <h2 className="text-xl font-semibold text-kumo-default">
                                Sign in with your passkey
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-kumo-subtle">
                                Your browser will ask for the device lock,
                                biometric, or security key associated with this
                                Gongyu deployment.
                            </p>
                        </div>
                        <Button
                            className="w-full sm:w-auto"
                            icon={FingerprintSimpleIcon}
                            loading={processing}
                            onClick={authenticate}
                            size="lg"
                            type="button"
                            variant="primary"
                        >
                            Sign in with passkey
                        </Button>
                        <p
                            aria-live="polite"
                            className="rounded-xl bg-kumo-tint/60 p-3 text-sm text-kumo-default"
                        >
                            {message}
                        </p>
                    </div>
                </LayerCard>
                <aside>
                    <LayerCard>
                        <div className="space-y-4 p-6">
                            <ShieldCheckIcon
                                aria-hidden="true"
                                className="text-kumo-success"
                                size={28}
                                weight="duotone"
                            />
                            <h2 className="font-semibold text-kumo-default">
                                Passwordless by design
                            </h2>
                            <ul className="space-y-3 text-sm leading-6 text-kumo-subtle">
                                <li>
                                    Credential verification stays on your
                                    device.
                                </li>
                                <li>Sessions use secure host-only cookies.</li>
                                <li>
                                    Every mutation is origin and CSRF protected.
                                </li>
                            </ul>
                        </div>
                    </LayerCard>
                </aside>
            </div>
            <noscript>
                <Banner
                    description="Passkey authentication uses the browser WebAuthn API and cannot continue without JavaScript."
                    title="JavaScript is required to sign in"
                    variant="error"
                />
            </noscript>
        </PageShell>
    );
}
