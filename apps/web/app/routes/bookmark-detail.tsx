import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import { Link, useRouteLoaderData } from 'react-router';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
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
    const imageUrl =
        loaderData.bookmark.thumbnailSha256 === null
            ? null
            : `${new URL(loaderData.canonicalUrl).origin}/thumbnails/${loaderData.bookmark.shortUrl}/${loaderData.bookmark.thumbnailSha256}`;
    return [
        { title: `${loaderData.bookmark.title} · Gongyu` },
        { name: 'description', content: description },
        { property: 'og:title', content: loaderData.bookmark.title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: loaderData.canonicalUrl },
        { property: 'og:type', content: 'article' },
        ...(imageUrl === null
            ? []
            : [{ property: 'og:image', content: imageUrl }]),
        {
            name: 'twitter:card',
            content: imageUrl === null ? 'summary' : 'summary_large_image',
        },
        { name: 'twitter:title', content: loaderData.bookmark.title },
        { name: 'twitter:description', content: description },
        ...(imageUrl === null
            ? []
            : [{ name: 'twitter:image', content: imageUrl }]),
        { tagName: 'link', rel: 'canonical', href: loaderData.canonicalUrl },
    ];
}

export default function BookmarkDetail({ loaderData }: Route.ComponentProps) {
    const { bookmark } = loaderData;
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const date = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(bookmark.createdAt / 1_000));
    return (
        <PageShell
            description={`${new URL(bookmark.url).hostname} · ${date}`}
            eyebrow="Bookmark"
            footer={
                <div className="flex flex-wrap gap-4">
                    <Link className="text-kumo-link" to="/">
                        Back to bookmarks
                    </Link>
                    {rootData?.authenticated === true ? (
                        <Link
                            className="text-kumo-link"
                            to={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                        >
                            Edit bookmark
                        </Link>
                    ) : null}
                </div>
            }
            title={bookmark.title}
        >
            <LayerCard className="max-w-3xl">
                <article className="space-y-5 p-6">
                    {bookmark.thumbnailSha256 === null ? null : (
                        <img
                            alt=""
                            className="max-h-96 w-full rounded-md object-cover"
                            loading="lazy"
                            src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                        />
                    )}
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
