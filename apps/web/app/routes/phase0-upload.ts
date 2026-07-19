import { Effect } from 'effect';
import { R2Store } from '../effect/r2-store';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/phase0-upload';

const MAX_UPLOAD_BYTES = 5 * 1_024 * 1_024;

export async function action({ context, request }: Route.ActionArgs) {
    const contentLength = Number(request.headers.get('Content-Length'));
    if (!Number.isInteger(contentLength) || contentLength <= 0) {
        return Response.json(
            { error: 'A positive Content-Length header is required.' },
            { status: 411 },
        );
    }
    if (contentLength > MAX_UPLOAD_BYTES) {
        return Response.json(
            { error: 'Upload exceeds the 5 MiB Phase 0 limit.' },
            { status: 413 },
        );
    }
    const requestBody = request.body;
    if (requestBody === null) {
        return Response.json(
            { error: 'An upload body is required.' },
            { status: 400 },
        );
    }

    const contentType =
        request.headers.get('Content-Type') ?? 'application/octet-stream';
    const key = `phase0/uploads/${crypto.randomUUID()}`;
    const { effect } = context.get(cloudflareRequestContext);
    const result = await effect.runPromise(
        Effect.gen(function* () {
            const r2Store = yield* R2Store;
            return yield* r2Store.putStream({
                body: requestBody,
                contentLength,
                contentType,
                key,
            });
        }).pipe(
            Effect.match({
                onFailure: () => ({ ok: false as const }),
                onSuccess: (object) => ({ object, ok: true as const }),
            }),
        ),
    );

    if (!result.ok) {
        return Response.json(
            { error: 'The streaming R2 upload failed.' },
            { status: 503 },
        );
    }

    return Response.json(
        {
            workflowPayload: {
                operation: 'phase0.import',
                source: {
                    bucket: 'uploads',
                    contentType: result.object.contentType,
                    etag: result.object.etag,
                    key: result.object.key,
                    size: result.object.size,
                },
                version: 1,
            },
        },
        { status: 201 },
    );
}
