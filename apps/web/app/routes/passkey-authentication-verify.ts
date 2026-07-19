import { readRequestJson, runPasskeyJson } from '../passkeys/http.server';
import { finishAuthentication } from '../passkeys/service';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-authentication-verify';

export async function action({ context, request }: Route.ActionArgs) {
    const { effect, env } = context.get(cloudflareRequestContext);
    const payload = await readRequestJson(request);
    return runPasskeyJson(
        effect,
        finishAuthentication(
            { origin: env.RP_ORIGIN, rpId: env.RP_ID },
            payload,
        ),
    );
}
