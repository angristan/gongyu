import { DataRunRepository } from '@gongyu/data/data-run-repository';
import { R2Store } from '@gongyu/integrations/r2-store';
import { Effect } from 'effect';
import { requireAuthentication } from '../auth/session.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/admin-data-download';

export async function loader({ context, params }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    requireAuthentication(authentication);
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const runs = yield* DataRunRepository;
            const run = yield* runs.getRun(params.runId);
            if (
                run === null ||
                run.state !== 'completed' ||
                run.artifactKey === null ||
                run.expiresAt === null ||
                run.expiresAt <= Date.now() * 1_000
            ) {
                return null;
            }
            const r2 = yield* R2Store;
            const object = yield* r2.get(run.artifactKey);
            return object === null ? null : { object, run };
        }),
    );
    if (result === null) {
        return new Response('Artifact not found or expired.', { status: 404 });
    }
    const extension =
        result.run.kind === 'backup'
            ? 'backup.json'
            : result.run.format === 'netscape_html'
              ? 'html'
              : 'json';
    return new Response(result.object.body, {
        headers: {
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="gongyu-${result.run.kind}-${result.run.id}.${extension}"`,
            'Content-Length': String(result.object.size),
            'Content-Type': result.object.contentType,
            ETag: result.object.etag,
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
