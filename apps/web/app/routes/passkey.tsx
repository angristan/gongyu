import { redirect } from 'react-router';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/passkey';

export function loader({ context }: Route.LoaderArgs) {
    const { authentication } = context.get(cloudflareRequestContext);
    return redirect(
        authentication.authenticated ? '/admin/security' : '/login',
    );
}
