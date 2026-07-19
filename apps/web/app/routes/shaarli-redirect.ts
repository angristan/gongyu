import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { Effect } from 'effect';
import { redirect } from 'react-router';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/shaarli-redirect';

export async function loader({ context, params }: Route.LoaderArgs) {
    const { effect } = context.get(cloudflareRequestContext);
    const bookmark = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.findByShaarliHash(params.hash ?? '');
        }),
    );
    if (bookmark === null) {
        throw new Response('Bookmark not found', { status: 404 });
    }
    return redirect(`/b/${bookmark.shortUrl}`, 301);
}
