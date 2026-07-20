import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { Effect } from 'effect';
import type { RequestEffectRunner } from '../effect/runtime';
import { parseBookmarkView } from './bookmark-view-switch';

export async function loadPublicBookmarks(
    effect: RequestEffectRunner,
    request: Request,
) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const view = parseBookmarkView(url.searchParams.get('view'));
    const pageValue = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.list({
                page,
                perPage: view === 'list' ? 30 : 24,
                query,
            });
        }),
    );
    return {
        basePath: url.pathname === '/search' ? '/search' : '/',
        query,
        result: {
            bookmarks: result.bookmarks.map((bookmark) => ({
                createdAt: bookmark.createdAt,
                description: bookmark.description,
                id: bookmark.id,
                shortUrl: bookmark.shortUrl,
                thumbnailSha256: bookmark.thumbnailSha256,
                title: bookmark.title,
                url: bookmark.url,
            })),
            page: result.page,
            pageCount: result.pageCount,
            perPage: result.perPage,
            total: result.total,
        },
        view,
    };
}
