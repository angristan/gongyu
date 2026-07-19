import { finishAuthentication } from '@gongyu/auth/service';
import {
    readRequestJson,
    runPasskeySessionJson,
} from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-authentication-verify';

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    if (request.headers.get('Origin') !== env.RP_ORIGIN) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }
    const payload = await readRequestJson(request);
    return runPasskeySessionJson(
        effect,
        authentication,
        finishAuthentication(
            { origin: env.RP_ORIGIN, rpId: env.RP_ID },
            payload,
        ),
    );
}
