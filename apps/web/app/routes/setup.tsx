import {
    RegistrationOptionsEnvelope,
    RegistrationVerificationRequest,
} from '@gongyu/auth/contracts';
import { hasPasskey } from '@gongyu/auth/service';
import { FingerprintSimpleIcon, KeyIcon } from '@phosphor-icons/react';
import { startRegistration } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useRef, useState } from 'react';
import { redirect } from 'react-router';
import { Banner, Button, Input, LayerCard } from '../components/ui';
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
    const [message, setMessage] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const registrationInFlight = useRef(false);

    async function register() {
        if (registrationInFlight.current) {
            return;
        }
        registrationInFlight.current = true;
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
            registrationInFlight.current = false;
            setProcessing(false);
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Passkey registration failed.',
            );
        }
    }

    return (
        <main
            className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md flex-col justify-center gap-3 px-4 py-8 sm:px-6"
            id="main-content"
            tabIndex={-1}
        >
            <LayerCard className="gongyu-bookmark-card">
                <div className="p-5 sm:p-6">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-gongyu-tint text-gongyu-link">
                        <KeyIcon
                            aria-hidden="true"
                            size={22}
                            weight="duotone"
                        />
                    </span>
                    <h1 className="mt-4 text-xl font-semibold text-gongyu-default">
                        Set up Gongyu
                    </h1>
                    <p className="mt-1 text-sm text-gongyu-subtle">
                        Register the administrator passkey once.
                    </p>
                    <div className="mt-5">
                        <Input
                            autoComplete="off"
                            label="Bootstrap token"
                            onChange={(event) =>
                                setBootstrapToken(event.currentTarget.value)
                            }
                            type="password"
                            value={bootstrapToken}
                        />
                    </div>
                    <Button
                        className="mt-4 w-full"
                        disabled={bootstrapToken.length === 0}
                        icon={FingerprintSimpleIcon}
                        loading={processing}
                        onClick={register}
                        type="button"
                        variant="primary"
                    >
                        Register administrator passkey
                    </Button>
                    {message === null ? null : (
                        <p
                            aria-live="polite"
                            className="mt-3 text-sm text-gongyu-subtle"
                        >
                            {message}
                        </p>
                    )}
                </div>
            </LayerCard>
            <noscript>
                <Banner
                    description="Passkeys require JavaScript and the browser WebAuthn API."
                    title="JavaScript is required"
                    variant="error"
                />
            </noscript>
        </main>
    );
}
