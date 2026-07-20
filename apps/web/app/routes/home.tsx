import { loadPublicBookmarks } from '../bookmarks/public.server';
import { PublicBookmarkPage } from '../bookmarks/public-bookmark-page';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/home';

export function meta(): Route.MetaDescriptors {
    return [
        { title: 'Gongyu · Links worth returning to' },
        {
            name: 'description',
            content: 'A personal library of saved links and notes.',
        },
    ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    return {
        ...(await loadPublicBookmarks(effect, request)),
        authenticated: authentication.authenticated,
    };
}

export default function Home({ loaderData }: Route.ComponentProps) {
    return <PublicBookmarkPage {...loaderData} />;
}
