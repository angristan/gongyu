import { Badge } from '@cloudflare/kumo/components/badge';
import { Banner } from '@cloudflare/kumo/components/banner';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    RegistrationOptionsEnvelope,
    RegistrationVerificationRequest,
} from '@gongyu/auth/contracts';
import {
    FingerprintSimpleIcon,
    KeyIcon,
    WarningIcon,
} from '@phosphor-icons/react';
import { startRegistration } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useState } from 'react';
import { redirect, useRouteLoaderData } from 'react-router';
import { AdminPage } from '../components/admin-page';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-security';

class ApiErrorEnvelope extends Schema.Class<ApiErrorEnvelope>(
    'SecurityApiErrorEnvelope',
)({
    error: Schema.Struct({ code: Schema.String, message: Schema.String }),
}) {}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Security · Gongyu' }];
}

export function loader({ context, request }: Route.LoaderArgs) {
    const { authentication } = context.get(cloudflareRequestContext);
    if (!authentication.authenticated) {
        const location = new URL(request.url);
        return redirect(
            `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
        );
    }
    return null;
}

async function postJson(
    path: string,
    body: unknown,
    csrfToken: string,
): Promise<unknown> {
    const response = await fetch(path, {
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
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

export default function AdminSecurity() {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const [message, setMessage] = useState(
        'Replacing the passkey invalidates the current session and signs this browser back in with a fresh session.',
    );
    const [processing, setProcessing] = useState(false);

    async function replacePasskey() {
        setProcessing(true);
        setMessage('Waiting for the replacement passkey…');
        try {
            const envelope = await Schema.decodeUnknownPromise(
                RegistrationOptionsEnvelope,
            )(
                await postJson(
                    '/api/passkey/registration/options',
                    {},
                    csrfToken,
                ),
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
                csrfToken,
            );
            window.location.assign('/admin/security');
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Passkey replacement failed.',
            );
        } finally {
            setProcessing(false);
        }
    }

    return (
        <AdminPage
            description="Manage the single credential that protects the administrator interface."
            section="Security"
            title="Security"
            width="default"
        >
            <div className="space-y-3">
                <LayerCard>
                    <section className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-kumo-line text-kumo-success">
                                    <FingerprintSimpleIcon
                                        aria-hidden="true"
                                        size={26}
                                        weight="duotone"
                                    />
                                </span>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold text-kumo-default">
                                            Administrator passkey
                                        </h2>
                                        <Badge
                                            appearance="dot"
                                            variant="success"
                                        >
                                            Active
                                        </Badge>
                                    </div>
                                    <p className="mt-1 max-w-xl text-sm leading-5 text-kumo-subtle">
                                        Gongyu accepts exactly one passkey. It
                                        can use your device lock, security key,
                                        or synchronized credential.
                                    </p>
                                </div>
                            </div>
                            <Dialog.Root role="alertdialog">
                                <Dialog.Trigger
                                    render={
                                        <Button
                                            icon={KeyIcon}
                                            size="sm"
                                            variant="secondary"
                                        />
                                    }
                                >
                                    Replace passkey
                                </Dialog.Trigger>
                                <Dialog className="space-y-5 p-6" size="lg">
                                    <div className="space-y-2">
                                        <Dialog.Title>
                                            Replace the administrator passkey?
                                        </Dialog.Title>
                                        <Dialog.Description>
                                            The current credential stops working
                                            immediately. Every session is
                                            invalidated, then this browser signs
                                            in again with the replacement.
                                        </Dialog.Description>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Dialog.Close
                                            render={
                                                <Button variant="secondary" />
                                            }
                                        >
                                            Cancel
                                        </Dialog.Close>
                                        <Button
                                            loading={processing}
                                            onClick={replacePasskey}
                                            type="button"
                                            variant="destructive"
                                        >
                                            Replace now
                                        </Button>
                                    </div>
                                </Dialog>
                            </Dialog.Root>
                        </div>
                        <div className="mt-4 rounded-lg border border-kumo-line px-3 py-2">
                            <p
                                aria-live="polite"
                                className="text-sm text-kumo-default"
                            >
                                {message}
                            </p>
                        </div>
                    </section>
                </LayerCard>
                <Banner
                    description="Replacement revokes existing sessions and the previous passkey together."
                    icon={<WarningIcon aria-hidden="true" size={20} />}
                    title="Before replacing your passkey"
                    variant="secondary"
                />
                <LayerCard>
                    <section className="grid gap-4 p-4 text-sm sm:grid-cols-2">
                        <div>
                            <h2 className="font-medium text-kumo-default">
                                Session protection
                            </h2>
                            <p className="mt-1 leading-5 text-kumo-subtle">
                                Sessions expire after seven idle days and have a
                                fixed 30-day maximum lifetime.
                            </p>
                        </div>
                        <div>
                            <h2 className="font-medium text-kumo-default">
                                Lost your passkey?
                            </h2>
                            <p className="mt-1 leading-5 text-kumo-subtle">
                                Recovery requires deployment access, the setup
                                token, and the exact operator confirmation
                                phrase.
                            </p>
                        </div>
                    </section>
                </LayerCard>
            </div>
            <noscript>
                <Banner
                    description="Passkey registration requires JavaScript and the browser WebAuthn API."
                    title="JavaScript is required to replace a passkey"
                    variant="error"
                />
            </noscript>
        </AdminPage>
    );
}
