import {
    AuthenticationOptionsEnvelope,
    AuthenticationVerificationRequest,
} from '@gongyu/auth/contracts';
import { FingerprintSimpleIcon } from '@phosphor-icons/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Schema } from 'effect';
import { useRef, useState } from 'react';
import { redirect } from 'react-router';
import { safeReturnTo } from '../auth/bootstrap.server';
import { Banner, Button, LayerCard } from '../components/ui';
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
    const [message, setMessage] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const authenticationInFlight = useRef(false);

    async function authenticate() {
        if (authenticationInFlight.current) {
            return;
        }
        authenticationInFlight.current = true;
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
            authenticationInFlight.current = false;
            setProcessing(false);
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Passkey authentication failed.',
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
                        <FingerprintSimpleIcon
                            aria-hidden="true"
                            size={23}
                            weight="duotone"
                        />
                    </span>
                    <h1 className="mt-4 text-xl font-semibold text-gongyu-default">
                        Sign in
                    </h1>
                    <p className="mt-1 text-sm text-gongyu-subtle">
                        Continue with your administrator passkey.
                    </p>
                    <Button
                        className="mt-5 w-full"
                        icon={FingerprintSimpleIcon}
                        loading={processing}
                        onClick={authenticate}
                        type="button"
                        variant="primary"
                    >
                        Sign in with passkey
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
