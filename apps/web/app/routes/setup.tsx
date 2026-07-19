import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    RegistrationOptionsEnvelope,
    RegistrationVerificationRequest,
} from '@gongyu/auth/contracts';
import { hasPasskey } from '@gongyu/auth/service';
import { PageShell } from '@gongyu/ui/page-shell';
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
            description="Setup closes permanently after one administrator passkey is registered."
            eyebrow="First-run setup"
            title="Secure Gongyu"
        >
            <LayerCard className="max-w-xl">
                <div className="space-y-5 p-6">
                    <label className="block space-y-2 text-sm font-medium text-kumo-default">
                        <span>Bootstrap token</span>
                        <input
                            autoComplete="off"
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
                            onChange={(event) =>
                                setBootstrapToken(event.currentTarget.value)
                            }
                            type="password"
                            value={bootstrapToken}
                        />
                    </label>
                    <p aria-live="polite" className="text-kumo-default">
                        {message}
                    </p>
                    <Button
                        disabled={bootstrapToken.length === 0}
                        loading={processing}
                        onClick={register}
                        type="button"
                    >
                        Register administrator passkey
                    </Button>
                </div>
            </LayerCard>
        </PageShell>
    );
}
