import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/bookmark-detail';

export async function loader({ context, params, request }: Route.LoaderArgs) {
    const { effect } = context.get(cloudflareRequestContext);
    const bookmark = await effect.runPromise(
        Effect.gen(function* () {
            const bookmarks = yield* BookmarkRepository;
            return yield* bookmarks.findByShortUrl(params.shortUrl ?? '');
        }),
    );
    if (bookmark === null) {
        throw new Response('Bookmark not found', { status: 404 });
    }
    const canonicalUrl = new URL(`/b/${bookmark.shortUrl}`, request.url).href;
    return { bookmark, canonicalUrl };
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
    if (loaderData === undefined) {
        return [{ title: 'Bookmark not found · Gongyu' }];
    }
    const description =
        loaderData.bookmark.description ?? loaderData.bookmark.url;
    return [
        { title: `${loaderData.bookmark.title} · Gongyu` },
        { name: 'description', content: description },
        { property: 'og:title', content: loaderData.bookmark.title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: loaderData.canonicalUrl },
        { property: 'og:type', content: 'article' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: loaderData.bookmark.title },
        { name: 'twitter:description', content: description },
        { tagName: 'link', rel: 'canonical', href: loaderData.canonicalUrl },
    ];
}

export default function BookmarkDetail({ loaderData }: Route.ComponentProps) {
    const { bookmark } = loaderData;
    return (
        <PageShell
            description={bookmark.url}
            eyebrow="Bookmark"
            title={bookmark.title}
        >
            <LayerCard className="max-w-3xl">
                <article className="space-y-5 p-6">
                    {bookmark.description === null ? null : (
                        <p className="whitespace-pre-wrap text-kumo-default">
                            {bookmark.description}
                        </p>
                    )}
                    <a
                        className="break-all font-medium text-kumo-link"
                        href={bookmark.url}
                        rel="noreferrer"
                    >
                        Visit original URL
                    </a>
                </article>
            </LayerCard>
        </PageShell>
    );
}
