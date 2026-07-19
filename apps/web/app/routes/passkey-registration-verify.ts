import { finishRegistration } from '@gongyu/auth/service';
import { readRequestJson, runPasskeyJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-registration-verify';

export async function action({ context, request }: Route.ActionArgs) {
    const { effect, env } = context.get(cloudflareRequestContext);
    const payload = await readRequestJson(request);
    return runPasskeyJson(
        effect,
        finishRegistration({ origin: env.RP_ORIGIN, rpId: env.RP_ID }, payload),
    );
}
