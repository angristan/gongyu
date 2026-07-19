import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    RegistrationOptionsEnvelope,
    RegistrationVerificationRequest,
} from '@gongyu/auth/contracts';
import { PageShell } from '@gongyu/ui/page-shell';
import { startRegistration } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useState } from 'react';
import { redirect, useRouteLoaderData } from 'react-router';
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
        <PageShell
            description="Gongyu stores exactly one administrator passkey. Registering a replacement removes the previous credential."
            eyebrow="Administrator · Security"
            title="Passkey"
        >
            <LayerCard className="max-w-xl">
                <div className="space-y-5 p-6">
                    <p aria-live="polite" className="text-kumo-default">
                        {message}
                    </p>
                    <Button
                        loading={processing}
                        onClick={replacePasskey}
                        type="button"
                        variant="secondary"
                    >
                        Replace passkey
                    </Button>
                </div>
            </LayerCard>
        </PageShell>
    );
}
