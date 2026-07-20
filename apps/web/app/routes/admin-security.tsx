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
    ShieldCheckIcon,
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
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
                <div className="space-y-6">
                    <LayerCard>
                        <section className="p-5 sm:p-7">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-4">
                                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-kumo-success-tint text-kumo-success">
                                        <FingerprintSimpleIcon
                                            aria-hidden="true"
                                            size={26}
                                            weight="duotone"
                                        />
                                    </span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-semibold text-kumo-default">
                                                Administrator passkey
                                            </h2>
                                            <Badge
                                                appearance="dot"
                                                variant="success"
                                            >
                                                Active
                                            </Badge>
                                        </div>
                                        <p className="mt-2 max-w-xl text-sm leading-6 text-kumo-subtle">
                                            Gongyu accepts exactly one passkey.
                                            It can use your device lock,
                                            security key, or synchronized
                                            credential.
                                        </p>
                                    </div>
                                </div>
                                <Dialog.Root role="alertdialog">
                                    <Dialog.Trigger
                                        render={
                                            <Button
                                                icon={KeyIcon}
                                                variant="secondary"
                                            />
                                        }
                                    >
                                        Replace passkey
                                    </Dialog.Trigger>
                                    <Dialog className="space-y-5 p-6" size="lg">
                                        <div className="space-y-2">
                                            <Dialog.Title>
                                                Replace the administrator
                                                passkey?
                                            </Dialog.Title>
                                            <Dialog.Description>
                                                The current credential stops
                                                working immediately. Every
                                                session is invalidated, then
                                                this browser signs in again with
                                                the replacement.
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
                                                variant="primary"
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    </Dialog>
                                </Dialog.Root>
                            </div>
                            <div className="mt-6 rounded-xl border border-kumo-line bg-kumo-tint/40 p-4">
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
                        description="Replacement is intentionally disruptive: existing sessions and the previous passkey are revoked together."
                        icon={<WarningIcon aria-hidden="true" size={20} />}
                        title="Before replacing your passkey"
                        variant="alert"
                    />
                </div>

                <aside className="space-y-4">
                    <LayerCard>
                        <section className="space-y-4 p-5">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-kumo-tint text-kumo-link">
                                <ShieldCheckIcon aria-hidden="true" size={22} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-kumo-default">
                                    Session protection
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-kumo-subtle">
                                    Sessions expire after seven idle days and
                                    have a fixed 30-day maximum lifetime.
                                </p>
                            </div>
                        </section>
                    </LayerCard>
                    <LayerCard>
                        <section className="p-5 text-sm">
                            <h2 className="font-semibold text-kumo-default">
                                Lost your passkey?
                            </h2>
                            <p className="mt-2 leading-6 text-kumo-subtle">
                                Recovery requires Cloudflare deployment access,
                                the setup token, and the exact operator
                                confirmation phrase.
                            </p>
                        </section>
                    </LayerCard>
                </aside>
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
