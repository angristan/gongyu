import { QueueJobMessage } from '@gongyu/domain/jobs';
import type { MetadataCandidate } from '@gongyu/domain/metadata';
import {
    formatSocialPayload,
    SocialPayloadError,
    SocialProvider,
    SocialSourceSnapshot,
} from '@gongyu/domain/social';
import { Context, Effect, Schema } from 'effect';
import type { D1Statement, D1Store, D1StoreFailure } from './d1-store';

export class MetadataTarget extends Schema.Class<MetadataTarget>(
    'MetadataTarget',
)({
    description: Schema.NullOr(Schema.String),
    shortUrl: Schema.String,
    thumbnailKey: Schema.NullOr(Schema.String),
    thumbnailUrl: Schema.NullOr(Schema.String),
    title: Schema.String,
    updatedAt: Schema.Number,
    url: Schema.String,
}) {}

export class PendingThumbnailDeletion extends Schema.Class<PendingThumbnailDeletion>(
    'PendingThumbnailDeletion',
)({
    cleanupKey: Schema.NullOr(Schema.String),
    key: Schema.NullOr(Schema.String),
}) {}

export class ThumbnailCleanup extends Schema.Class<ThumbnailCleanup>(
    'ThumbnailCleanup',
)({ key: Schema.String }) {}

export class MirroredThumbnail extends Schema.Class<MirroredThumbnail>(
    'MirroredThumbnail',
)({
    contentType: Schema.String,
    key: Schema.String,
    sha256: Schema.String,
}) {}

class WaitingSocialDelivery extends Schema.Class<WaitingSocialDelivery>(
    'WaitingSocialDelivery',
)({
    id: Schema.String,
    provider: SocialProvider,
    sourceJson: Schema.String,
}) {}

export interface MetadataRepositoryShape {
    readonly completeThumbnailCleanup: (
        shortUrl: string,
        key: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly finalizeDeletion: (
        shortUrl: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly findPendingDeletion: (
        shortUrl: string,
    ) => Effect.Effect<PendingThumbnailDeletion | null, D1StoreFailure>;
    readonly findTarget: (
        shortUrl: string,
    ) => Effect.Effect<MetadataTarget | null, D1StoreFailure>;
    readonly findThumbnailCleanup: (
        shortUrl: string,
    ) => Effect.Effect<ThumbnailCleanup | null, D1StoreFailure>;
    readonly findThumbnail: (
        shortUrl: string,
        sha256: string,
    ) => Effect.Effect<MirroredThumbnail | null, D1StoreFailure>;
    readonly finalize: (input: {
        readonly candidate: MetadataCandidate | null;
        readonly errorCode: string | null;
        readonly expectedUpdatedAt: number;
        readonly now: number;
        readonly shortUrl: string;
        readonly thumbnail: {
            readonly contentType: string;
            readonly height: number;
            readonly key: string;
            readonly sha256: string;
            readonly size: number;
            readonly sourceUrl: string;
            readonly width: number;
        } | null;
        readonly thumbnailSourceUrl: string | null;
    }) => Effect.Effect<boolean, D1StoreFailure | SocialPayloadError>;
}

export class MetadataRepository extends Context.Service<
    MetadataRepository,
    MetadataRepositoryShape
>()('@gongyu/data/MetadataRepository') {}

export function makeMetadataRepository(
    d1Store: D1Store['Service'],
): MetadataRepositoryShape {
    const findTarget = Effect.fn('MetadataRepository.findTarget')(
        (shortUrl: string) =>
            d1Store.first(
                MetadataTarget,
                `
                    SELECT
                        short_url AS "shortUrl",
                        url,
                        title,
                        description,
                        thumbnail_key AS "thumbnailKey",
                        thumbnail_url AS "thumbnailUrl",
                        updated_at AS "updatedAt"
                    FROM bookmarks
                    WHERE short_url = ?
                      AND deletion_state = 'active'
                      AND metadata_state IN ('pending', 'failed')
                `,
                [shortUrl],
            ),
    );

    const findPendingDeletion = Effect.fn(
        'MetadataRepository.findPendingDeletion',
    )((shortUrl: string) =>
        d1Store.first(
            PendingThumbnailDeletion,
            `
                SELECT
                    thumbnail_key AS key,
                    thumbnail_cleanup_key AS "cleanupKey"
                FROM bookmarks
                WHERE short_url = ?
                  AND deletion_state = 'pending'
                  AND (
                    thumbnail_key IS NOT NULL
                    OR thumbnail_cleanup_key IS NOT NULL
                  )
            `,
            [shortUrl],
        ),
    );

    const findThumbnailCleanup = Effect.fn(
        'MetadataRepository.findThumbnailCleanup',
    )((shortUrl: string) =>
        d1Store.first(
            ThumbnailCleanup,
            `
                SELECT thumbnail_cleanup_key AS key
                FROM bookmarks
                WHERE short_url = ?
                  AND thumbnail_cleanup_key IS NOT NULL
            `,
            [shortUrl],
        ),
    );

    const completeThumbnailCleanup = Effect.fn(
        'MetadataRepository.completeThumbnailCleanup',
    )(function* (shortUrl: string, key: string) {
        const result = yield* d1Store.run(
            `
                UPDATE bookmarks
                SET thumbnail_cleanup_key = NULL
                WHERE short_url = ? AND thumbnail_cleanup_key = ?
            `,
            [shortUrl, key],
        );
        return result.changes === 1;
    });

    const finalizeDeletion = Effect.fn('MetadataRepository.finalizeDeletion')(
        function* (shortUrl: string) {
            const result = yield* d1Store.run(
                `DELETE FROM bookmarks WHERE short_url = ? AND deletion_state = 'pending'`,
                [shortUrl],
            );
            return result.changes === 1;
        },
    );

    const findThumbnail = Effect.fn('MetadataRepository.findThumbnail')(
        (shortUrl: string, sha256: string) =>
            d1Store.first(
                MirroredThumbnail,
                `
                    SELECT
                        thumbnail_key AS key,
                        thumbnail_content_type AS "contentType",
                        thumbnail_sha256 AS sha256
                    FROM bookmarks
                    WHERE short_url = ?
                      AND thumbnail_sha256 = ?
                      AND thumbnail_key IS NOT NULL
                      AND deletion_state = 'active'
                `,
                [shortUrl, sha256],
            ),
    );

    const finalize = Effect.fn('MetadataRepository.finalize')(
        function* (input: {
            readonly candidate: MetadataCandidate | null;
            readonly errorCode: string | null;
            readonly expectedUpdatedAt: number;
            readonly now: number;
            readonly shortUrl: string;
            readonly thumbnail: {
                readonly contentType: string;
                readonly height: number;
                readonly key: string;
                readonly sha256: string;
                readonly size: number;
                readonly sourceUrl: string;
                readonly width: number;
            } | null;
            readonly thumbnailSourceUrl: string | null;
        }) {
            const deliveries = yield* d1Store.query(
                WaitingSocialDelivery,
                `
                    SELECT
                        id,
                        provider,
                        source_json AS "sourceJson"
                    FROM social_deliveries
                    WHERE bookmark_short_url = ?
                      AND state = 'waiting_metadata'
                    ORDER BY id
                `,
                [input.shortUrl],
            );
            const statements: D1Statement[] = [
                {
                    sql: `
                        UPDATE bookmarks
                        SET
                            metadata_state = ?,
                            metadata_error_code = ?,
                            metadata_attempted_at = ?,
                            thumbnail_cleanup_key = CASE
                                WHEN thumbnail_key IS NOT NULL
                                  AND thumbnail_key <> COALESCE(?, '')
                                THEN thumbnail_key
                                ELSE thumbnail_cleanup_key
                            END,
                            thumbnail_url = ?,
                            thumbnail_key = ?,
                            thumbnail_content_type = ?,
                            thumbnail_size = ?,
                            thumbnail_width = ?,
                            thumbnail_height = ?,
                            thumbnail_sha256 = ?
                        WHERE short_url = ?
                          AND deletion_state = 'active'
                          AND metadata_state IN ('pending', 'failed')
                          AND updated_at = ?
                    `,
                    parameters: [
                        input.errorCode === null ? 'completed' : 'failed',
                        input.errorCode,
                        input.now,
                        input.thumbnail?.key ?? null,
                        input.thumbnail?.sourceUrl ?? input.thumbnailSourceUrl,
                        input.thumbnail?.key ?? null,
                        input.thumbnail?.contentType ?? null,
                        input.thumbnail?.size ?? null,
                        input.thumbnail?.width ?? null,
                        input.thumbnail?.height ?? null,
                        input.thumbnail?.sha256 ?? null,
                        input.shortUrl,
                        input.expectedUpdatedAt,
                    ],
                },
            ];

            for (const delivery of deliveries.rows) {
                const sourceUnknown = yield* Effect.try({
                    try: () => JSON.parse(delivery.sourceJson),
                    catch: () =>
                        SocialPayloadError.make({
                            code: 'invalid_source_snapshot',
                            provider: delivery.provider,
                        }),
                });
                const source = yield* Schema.decodeUnknownEffect(
                    SocialSourceSnapshot,
                )(sourceUnknown).pipe(
                    Effect.mapError(() =>
                        SocialPayloadError.make({
                            code: 'invalid_source_snapshot',
                            provider: delivery.provider,
                        }),
                    ),
                );
                const payload = yield* formatSocialPayload({
                    description: source.description ?? '',
                    finalizedAt: input.now,
                    originalUrl: source.originalUrl,
                    provider: delivery.provider,
                    r2ThumbnailKey: input.thumbnail?.key ?? null,
                    shortUrl: source.shortUrl,
                    title: source.title,
                }).pipe(
                    Effect.match({
                        onFailure: (error) => ({ ok: false as const, error }),
                        onSuccess: (value) => ({ ok: true as const, value }),
                    }),
                );
                if (!payload.ok) {
                    statements.push({
                        sql: `
                            UPDATE social_deliveries
                            SET
                                state = 'failed',
                                last_error_code = ?,
                                completed_at = ?,
                                updated_at = ?
                            WHERE id = ?
                              AND state = 'waiting_metadata'
                              AND EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE short_url = ?
                                  AND deletion_state = 'active'
                                  AND updated_at = ?
                              )
                        `,
                        parameters: [
                            payload.error.code,
                            input.now,
                            input.now,
                            delivery.id,
                            input.shortUrl,
                            input.expectedUpdatedAt,
                        ],
                    });
                    continue;
                }
                const message = QueueJobMessage.make({
                    bookmarkShortUrl: input.shortUrl,
                    jobId: delivery.id,
                    kind: 'social',
                    version: 1,
                });
                statements.push(
                    {
                        sql: `
                            UPDATE social_deliveries
                            SET
                                state = 'queued',
                                payload_json = ?,
                                updated_at = ?
                            WHERE id = ?
                              AND state = 'waiting_metadata'
                              AND EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE short_url = ?
                                  AND deletion_state = 'active'
                                  AND updated_at = ?
                              )
                        `,
                        parameters: [
                            JSON.stringify(payload.value),
                            input.now,
                            delivery.id,
                            input.shortUrl,
                            input.expectedUpdatedAt,
                        ],
                    },
                    {
                        sql: `
                            INSERT OR IGNORE INTO outbox (
                                id,
                                bookmark_short_url,
                                kind,
                                state,
                                payload_version,
                                payload_json,
                                available_at,
                                created_at,
                                updated_at
                            )
                            SELECT ?, ?, 'social', 'pending', 1, ?, ?, ?, ?
                            WHERE EXISTS (
                                SELECT 1 FROM bookmarks
                                WHERE short_url = ?
                                  AND deletion_state = 'active'
                                  AND updated_at = ?
                            )
                        `,
                        parameters: [
                            delivery.id,
                            input.shortUrl,
                            JSON.stringify(message),
                            input.now,
                            input.now,
                            input.now,
                            input.shortUrl,
                            input.expectedUpdatedAt,
                        ],
                    },
                );
            }
            const results = yield* d1Store.batch(statements);
            return (results[0]?.changes ?? 0) === 1;
        },
    );

    return {
        completeThumbnailCleanup,
        finalize,
        finalizeDeletion,
        findPendingDeletion,
        findTarget,
        findThumbnail,
        findThumbnailCleanup,
    };
}
