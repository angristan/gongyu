import { finishRegistration } from '@gongyu/auth/service';
import { SessionService } from '@gongyu/auth/session-service';
import { Effect } from 'effect';
import { requireAuthenticatedMutation } from '../auth/session.server';
import {
    readRequestJson,
    runPasskeySessionJson,
} from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey-registration-verify';

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    if (authentication.authenticated) {
        await requireAuthenticatedMutation({
            authentication,
            expectedOrigin: env.RP_ORIGIN,
            request,
            runner: effect,
        });
    } else if (request.headers.get('Origin') !== env.RP_ORIGIN) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }
    const payload = await readRequestJson(request);
    const registration = finishRegistration(
        { origin: env.RP_ORIGIN, rpId: env.RP_ID },
        payload,
    ).pipe(
        Effect.tap((result) =>
            result.registrationMode === 'replacement'
                ? Effect.gen(function* () {
                      const sessions = yield* SessionService;
                      yield* sessions.invalidateAll;
                  })
                : Effect.void,
        ),
    );
    return runPasskeySessionJson(effect, authentication, registration);
}
