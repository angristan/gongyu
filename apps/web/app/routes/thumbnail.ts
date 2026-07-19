import { MetadataRepository } from '@gongyu/data/metadata-repository';
import { R2Store } from '@gongyu/integrations/r2-store';
import { Effect } from 'effect';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/thumbnail';

export async function loader({ context, params }: Route.LoaderArgs) {
    if (!/^[0-9a-f]{64}$/u.test(params.digest)) {
        return new Response('Not found', { status: 404 });
    }
    const { effect } = context.get(cloudflareRequestContext);
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const metadata = yield* MetadataRepository;
            const thumbnail = yield* metadata.findThumbnail(
                params.shortUrl,
                params.digest,
            );
            if (thumbnail === null) {
                return null;
            }
            const r2 = yield* R2Store;
            const object = yield* r2.get(thumbnail.key);
            return object === null ? null : { object, thumbnail };
        }),
    );
    if (result === null) {
        return new Response('Not found', { status: 404 });
    }
    return new Response(result.object.body, {
        headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(result.object.size),
            'Content-Type': result.thumbnail.contentType,
            ETag: result.object.etag,
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
