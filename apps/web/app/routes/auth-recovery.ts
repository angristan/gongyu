import { recoverAdministrator } from '@gongyu/auth/service';
import { Schema } from 'effect';
import {
    bootstrapTokenMatches,
    RecoveryRequest,
} from '../auth/bootstrap.server';
import { readRequestJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/auth-recovery';

export async function action({ context, request }: Route.ActionArgs) {
    const { effect, env, requestId } = context.get(cloudflareRequestContext);
    if (request.headers.get('Origin') !== env.RP_ORIGIN) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }
    const payload = await readRequestJson(request);
    const recovery = await Schema.decodeUnknownPromise(RecoveryRequest)(
        payload,
    ).catch(() => null);
    if (recovery === null) {
        throw new Response('Recovery confirmation is invalid', { status: 400 });
    }
    if (
        !(await bootstrapTokenMatches(recovery.bootstrapToken, env.SETUP_TOKEN))
    ) {
        throw new Response('Bootstrap token is invalid', { status: 403 });
    }

    await effect.runPromise(
        recoverAdministrator({ now: Date.now(), requestId }),
    );
    return new Response(null, { status: 204 });
}
