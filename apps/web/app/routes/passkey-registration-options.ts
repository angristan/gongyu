import { runPasskeyJson } from '../passkeys/http.server';
import { beginRegistration } from '../passkeys/service';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-registration-options';

export function action({ context }: Route.ActionArgs) {
    const { effect, env } = context.get(cloudflareRequestContext);
    return runPasskeyJson(
        effect,
        beginRegistration({ origin: env.RP_ORIGIN, rpId: env.RP_ID }),
    );
}
