import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    AuthenticationOptionsEnvelope,
    AuthenticationVerificationRequest,
} from '@gongyu/auth/contracts';
import { PageShell } from '@gongyu/ui/page-shell';
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
            description="Authentication uses one discoverable passkey. No password or administrator profile is stored."
            eyebrow="Administrator"
            title="Sign in to Gongyu"
        >
            <LayerCard className="max-w-xl">
                <div className="space-y-5 p-6">
                    <p aria-live="polite" className="text-kumo-default">
                        {message}
                    </p>
                    <Button
                        loading={processing}
                        onClick={authenticate}
                        type="button"
                    >
                        Sign in with passkey
                    </Button>
                </div>
            </LayerCard>
        </PageShell>
    );
}
