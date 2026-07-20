import { Badge } from '@cloudflare/kumo/components/badge';
import { Breadcrumbs } from '@cloudflare/kumo/components/breadcrumbs';
import { LinkButton } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { BookmarkRepository } from '@gongyu/data/bookmark-repository';
import { PageShell } from '@gongyu/ui/page-shell';
import {
    ArrowLeftIcon,
    ArrowSquareOutIcon,
    BookmarkSimpleIcon,
    CalendarBlankIcon,
    PencilSimpleIcon,
} from '@phosphor-icons/react';
import { Effect } from 'effect';
import { useRouteLoaderData } from 'react-router';
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
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./u, '');
    return (
        <PageShell
            actions={
                <>
                    <LinkButton
                        external
                        href={bookmark.url}
                        icon={ArrowSquareOutIcon}
                        variant="primary"
                    >
                        Open original
                    </LinkButton>
                    {rootData?.authenticated === true ? (
                        <LinkButton
                            href={`/admin/bookmarks/${bookmark.shortUrl}/edit`}
                            icon={PencilSimpleIcon}
                            variant="secondary"
                        >
                            Edit
                        </LinkButton>
                    ) : null}
                </>
            }
            breadcrumbs={
                <Breadcrumbs size="sm">
                    <Breadcrumbs.Link href="/">Library</Breadcrumbs.Link>
                    <Breadcrumbs.Separator />
                    <Breadcrumbs.Current>Bookmark</Breadcrumbs.Current>
                </Breadcrumbs>
            }
            description="A saved link with the context attached when it joined the library."
            eyebrow="Bookmark details"
            footer={
                <LinkButton
                    href="/"
                    icon={ArrowLeftIcon}
                    size="sm"
                    variant="ghost"
                >
                    Back to the library
                </LinkButton>
            }
            title={bookmark.title}
            width="wide"
        >
            <LayerCard className="overflow-hidden">
                <article className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                    <div className="min-h-64 bg-kumo-tint lg:min-h-[30rem]">
                        {bookmark.thumbnailSha256 === null ? (
                            <div className="flex size-full min-h-64 items-center justify-center lg:min-h-[30rem]">
                                <BookmarkSimpleIcon
                                    aria-hidden="true"
                                    className="text-kumo-subtle/40"
                                    size={72}
                                    weight="duotone"
                                />
                            </div>
                        ) : (
                            <img
                                alt=""
                                className="size-full max-h-[42rem] object-cover"
                                src={`/thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256}`}
                            />
                        )}
                    </div>
                    <div className="flex flex-col gap-7 border-t border-kumo-line p-6 sm:p-8 lg:border-l lg:border-t-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{hostname}</Badge>
                            <Badge appearance="dot" variant="info">
                                Saved link
                            </Badge>
                        </div>
                        {bookmark.description === null ? (
                            <p className="text-sm leading-6 text-kumo-subtle">
                                No note was attached to this bookmark.
                            </p>
                        ) : (
                            <p className="whitespace-pre-wrap text-base leading-7 text-kumo-default">
                                {bookmark.description}
                            </p>
                        )}
                        <dl className="mt-auto space-y-4 border-t border-kumo-line pt-6 text-sm">
                            <div className="flex items-start gap-3">
                                <CalendarBlankIcon
                                    aria-hidden="true"
                                    className="mt-0.5 shrink-0 text-kumo-subtle"
                                    size={18}
                                />
                                <div>
                                    <dt className="font-medium text-kumo-default">
                                        Saved
                                    </dt>
                                    <dd className="text-kumo-subtle">{date}</dd>
                                </div>
                            </div>
                            <div>
                                <dt className="mb-1 font-medium text-kumo-default">
                                    Original URL
                                </dt>
                                <dd>
                                    <a
                                        className="break-all text-kumo-link"
                                        href={bookmark.url}
                                        rel="noreferrer"
                                        target="_blank"
                                    >
                                        {bookmark.url}
                                    </a>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </article>
            </LayerCard>
        </PageShell>
    );
}
