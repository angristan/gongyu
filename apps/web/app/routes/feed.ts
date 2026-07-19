import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { SettingsRepository } from '@gongyu/data/settings-repository';
import { generateAtomFeed } from '@gongyu/domain/feed';
import { Effect } from 'effect';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/feed';

export async function loader({ context, request }: Route.LoaderArgs) {
    const { effect } = context.get(cloudflareRequestContext);
    const feed = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            const settings = yield* SettingsRepository;
            const configuration = yield* settings.get;
            const [rows, latestUpdatedAt] = yield* Effect.all([
                bookmarks.listForFeed(configuration.feedCount),
                bookmarks.latestUpdatedAt,
            ]);
            return generateAtomFeed({
                baseUrl: new URL(request.url).origin,
                bookmarks: rows,
                updatedAt: latestUpdatedAt ?? Date.now() * 1_000,
            });
        }),
    );
    return new Response(feed, {
        headers: { 'Content-Type': 'application/atom+xml; charset=UTF-8' },
    });
}
