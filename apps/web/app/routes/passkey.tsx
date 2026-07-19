import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    AuthenticationOptionsEnvelope,
    RegistrationOptionsEnvelope,
} from '@gongyu/auth/contracts';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    startAuthentication,
    startRegistration,
} from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/passkey';

class ApiErrorEnvelope extends Schema.Class<ApiErrorEnvelope>(
    'ApiErrorEnvelope',
)({
    error: Schema.Struct({
        code: Schema.String,
        message: Schema.String,
    }),
}) {}

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Passkey spike · Gongyu' }];
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(path, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers:
            body === undefined
                ? undefined
                : { 'Content-Type': 'application/json' },
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

export default function PasskeySpike() {
    const [message, setMessage] = useState(
        'Register one passkey, then authenticate with it.',
    );
    const [processing, setProcessing] = useState(false);

    async function register() {
        setProcessing(true);
        setMessage('Waiting for passkey registration…');
        try {
            const envelope = await Schema.decodeUnknownPromise(
                RegistrationOptionsEnvelope,
            )(await postJson('/api/passkey/registration/options'));
            const response = await startRegistration({
                optionsJSON: envelope.options,
            });
            await postJson('/api/passkey/registration/verify', {
                ceremonyId: envelope.ceremonyId,
                response,
            });
            setMessage('Passkey registered successfully.');
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

    async function authenticate() {
        setProcessing(true);
        setMessage('Waiting for passkey authentication…');
        try {
            const envelope = await Schema.decodeUnknownPromise(
                AuthenticationOptionsEnvelope,
            )(await postJson('/api/passkey/authentication/options'));
            const response = await startAuthentication({
                optionsJSON: envelope.options,
            });
            await postJson('/api/passkey/authentication/verify', {
                ceremonyId: envelope.ceremonyId,
                response,
            });
            setMessage('Passkey authentication succeeded.');
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
            description="SimpleWebAuthn runs inside the Workers runtime with an exact environment RP ID and origin."
            eyebrow="Platform foundation · WebAuthn"
            footer={
                <Link className="text-kumo-link" to="/">
                    Return to runtime status
                </Link>
            }
            title="Single-passkey validation"
        >
            <LayerCard>
                <div className="space-y-5 p-6">
                    <p aria-live="polite" className="text-kumo-default">
                        {message}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            type="button"
                            loading={processing}
                            onClick={register}
                        >
                            Register passkey
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            loading={processing}
                            onClick={authenticate}
                        >
                            Authenticate
                        </Button>
                    </div>
                </div>
            </LayerCard>
        </PageShell>
    );
}
