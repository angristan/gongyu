import { beginAuthentication } from '@gongyu/auth/service';
import { runPasskeyJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-authentication-options';

export function action({ context }: Route.ActionArgs) {
    const { effect, env } = context.get(cloudflareRequestContext);
    return runPasskeyJson(
        effect,
        beginAuthentication({
            origin: env.RP_ORIGIN,
            rpId: env.RP_ID,
        }),
    );
}
