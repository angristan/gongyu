import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { Effect } from 'effect';
import type { RequestEffectRunner } from '../effect/runtime';

export async function loadPublicBookmarks(
    effect: RequestEffectRunner,
    request: Request,
) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const pageValue = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.list({ page, perPage: 20, query });
        }),
    );
    return { query, result };
}
