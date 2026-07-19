import { MetadataError } from '@gongyu/domain/metadata';
import { MetadataClient } from '@gongyu/integrations/metadata-client';
import { Effect, Schema } from 'effect';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { failure, success } from '../effect/result';
import { readRequestJson } from '../passkeys/http.server';
import { cloudflareRequestContext } from '../platform-context';
import type { Route } from './+types/metadata-preview';

class MetadataPreviewRequest extends Schema.Class<MetadataPreviewRequest>(
    'MetadataPreviewRequest',
)({
    url: Schema.String,
}) {}

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        runner: effect,
    });
    const unknownPayload = await readRequestJson(request);
    const payload = await Schema.decodeUnknownPromise(MetadataPreviewRequest)(
        unknownPayload,
    ).catch(() => null);
    if (payload === null) {
        return Response.json(
            { error: { code: 'invalid_payload', message: 'Enter a URL.' } },
            { status: 400 },
        );
    }

    const result = await effect.runPromise(
        Effect.gen(function* () {
            const metadata = yield* MetadataClient;
            return yield* metadata.fetch(payload.url);
        }).pipe(Effect.match({ onFailure: failure, onSuccess: success })),
    );
    if (!result.ok) {
        const error = result.error;
        const status =
            error instanceof MetadataError &&
            ['credentials_forbidden', 'https_required', 'invalid_url'].includes(
                error.code,
            )
                ? 400
                : 502;
        return Response.json(
            {
                error: {
                    code:
                        error instanceof MetadataError
                            ? error.code
                            : 'metadata_failed',
                    message:
                        error instanceof MetadataError
                            ? error.message
                            : 'Metadata could not be fetched.',
                },
            },
            { status },
        );
    }

    return Response.json({
        description: result.value.description,
        title: result.value.title,
    });
}
