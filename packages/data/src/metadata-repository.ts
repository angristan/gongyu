import type { MetadataCandidate } from '@gongyu/domain/metadata';
import { Context, Effect, Schema } from 'effect';
import type { D1Store, D1StoreFailure } from './d1-store';

export class MetadataTarget extends Schema.Class<MetadataTarget>(
    'MetadataTarget',
)({
    cleanupKey: Schema.NullOr(Schema.String),
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

export class FinalizedMetadata extends Schema.Class<FinalizedMetadata>(
    'FinalizedMetadata',
)({
    cleanupKey: Schema.NullOr(Schema.String),
    errorCode: Schema.NullOr(Schema.String),
    finalizedAt: Schema.Number,
    thumbnailKey: Schema.NullOr(Schema.String),
}) {}

export interface MetadataRepositoryShape {
    readonly completeThumbnailCleanup: (
        shortUrl: string,
        key: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly finalizeDeletion: (
        shortUrl: string,
    ) => Effect.Effect<boolean, D1StoreFailure>;
    readonly findFinalized: (
        shortUrl: string,
    ) => Effect.Effect<FinalizedMetadata | null, D1StoreFailure>;
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
    }) => Effect.Effect<FinalizedMetadata | null, D1StoreFailure>;
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
                        thumbnail_cleanup_key AS "cleanupKey",
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

    const findFinalized = Effect.fn('MetadataRepository.findFinalized')(
        (shortUrl: string) =>
            d1Store.first(
                FinalizedMetadata,
                `
                    SELECT
                        thumbnail_cleanup_key AS "cleanupKey",
                        metadata_error_code AS "errorCode",
                        metadata_attempted_at AS "finalizedAt",
                        thumbnail_key AS "thumbnailKey"
                    FROM bookmarks
                    WHERE short_url = ?
                      AND deletion_state = 'active'
                      AND metadata_state IN ('completed', 'failed')
                      AND metadata_attempted_at IS NOT NULL
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
            return yield* d1Store.first(
                FinalizedMetadata,
                `
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
                    RETURNING
                        thumbnail_cleanup_key AS "cleanupKey",
                        metadata_error_code AS "errorCode",
                        metadata_attempted_at AS "finalizedAt",
                        thumbnail_key AS "thumbnailKey"
                `,
                [
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
            );
        },
    );

    return {
        completeThumbnailCleanup,
        finalize,
        finalizeDeletion,
        findFinalized,
        findPendingDeletion,
        findTarget,
        findThumbnail,
        findThumbnailCleanup,
    };
}
