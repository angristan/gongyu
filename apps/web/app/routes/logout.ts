import { SessionService } from '@gongyu/auth/session-service';
import { Effect } from 'effect';
import { redirect } from 'react-router';
import {
    appendClearedSessionCookies,
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/logout';

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        runner: effect,
    });
    await effect.runPromise(
        Effect.gen(function* () {
            const sessions = yield* SessionService;
            yield* sessions.invalidate(authentication.sessionToken);
        }),
    );

    const headers = new Headers();
    appendClearedSessionCookies(headers);
    return redirect('/login', { headers });
}
