import { beginAuthentication } from '@gongyu/auth/service';
import { runPasskeyJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-authentication-options';

export function action({ context, request }: Route.ActionArgs) {
    const { effect, env } = context.get(cloudflareRequestContext);
    if (request.headers.get('Origin') !== env.RP_ORIGIN) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }
    return runPasskeyJson(
        effect,
        beginAuthentication({
            origin: env.RP_ORIGIN,
            rpId: env.RP_ID,
        }),
    );
}
