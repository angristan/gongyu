import { beginRegistration } from '@gongyu/auth/service';
import { Schema } from 'effect';
import {
    BootstrapRequest,
    bootstrapTokenMatches,
} from '../auth/bootstrap.server';
import { requireAuthenticatedMutation } from '../auth/session.server';
import { readRequestJson, runPasskeyJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-registration-options';

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    let registrationMode: 'replacement' | 'setup' = 'setup';
    if (authentication.authenticated) {
        await requireAuthenticatedMutation({
            authentication,
            expectedOrigin: env.RP_ORIGIN,
            request,
            requireWritable: true,
            runner: effect,
        });
        registrationMode = 'replacement';
    } else {
        if (request.headers.get('Origin') !== env.RP_ORIGIN) {
            throw new Response('Request origin is not allowed', {
                status: 403,
            });
        }
        const payload = await readRequestJson(request);
        const bootstrap = await Schema.decodeUnknownPromise(BootstrapRequest)(
            payload,
        ).catch(() => null);
        if (
            bootstrap === null ||
            !(await bootstrapTokenMatches(
                bootstrap.bootstrapToken,
                env.SETUP_TOKEN,
            ))
        ) {
            throw new Response('Bootstrap token is invalid', { status: 403 });
        }
    }

    return runPasskeyJson(
        effect,
        beginRegistration(
            { origin: env.RP_ORIGIN, rpId: env.RP_ID },
            registrationMode,
        ),
    );
}
