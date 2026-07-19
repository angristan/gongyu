import { SocialPayloadSnapshot, SocialProvider } from '@gongyu/domain/social';
import { Context, Effect, Schema } from 'effect';
import { D1DecodeError, type D1Store, type D1StoreFailure } from './d1-store';

class ClaimedSocialRow extends Schema.Class<ClaimedSocialRow>(
    'ClaimedSocialRow',
)({
    attempts: Schema.Number,
    id: Schema.String,
    lastErrorCode: Schema.NullOr(Schema.String),
    payloadJson: Schema.String,
    provider: SocialProvider,
}) {}

export class SocialDeliveryStatus extends Schema.Class<SocialDeliveryStatus>(
    'SocialDeliveryStatus',
)({
    availableAt: Schema.Number,
    leaseExpiresAt: Schema.NullOr(Schema.Number),
    state: Schema.String,
}) {}

export interface SocialDeliveryLease {
    readonly attempts: number;
    readonly id: string;
    readonly lastErrorCode: string | null;
    readonly payload: SocialPayloadSnapshot;
    readonly provider: SocialProvider;
}

export interface SocialRepositoryShape {
    readonly claim: (input: {
        readonly id: string;
        readonly leaseDurationMicros: number;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<SocialDeliveryLease | null, D1StoreFailure>;
    readonly complete: (input: {
        readonly id: string;
        readonly now: number;
        readonly remoteId: string;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly fail: (input: {
        readonly errorCode: string;
        readonly id: string;
        readonly needsReview: boolean;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly getStatus: (
        id: string,
    ) => Effect.Effect<SocialDeliveryStatus | null, D1StoreFailure>;
    readonly release: (input: {
        readonly availableAt: number;
        readonly errorCode: string;
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
}

export class SocialRepository extends Context.Service<
    SocialRepository,
    SocialRepositoryShape
>()('@gongyu/data/SocialRepository') {}

export function makeSocialRepository(
    d1Store: D1Store['Service'],
): SocialRepositoryShape {
    const claim = Effect.fn('SocialRepository.claim')(function* (input: {
        readonly id: string;
        readonly leaseDurationMicros: number;
        readonly now: number;
        readonly token: string;
    }) {
        const row = yield* d1Store.first(
            ClaimedSocialRow,
            `
                UPDATE social_deliveries
                SET
                    state = 'processing',
                    lease_token = ?,
                    lease_expires_at = ?,
                    attempts = attempts + 1,
                    updated_at = ?
                WHERE id = ?
                  AND available_at <= ?
                  AND (
                    state IN ('queued', 'retrying')
                    OR (
                        state = 'processing'
                        AND lease_expires_at <= ?
                    )
                  )
                RETURNING
                    id,
                    provider,
                    payload_json AS "payloadJson",
                    last_error_code AS "lastErrorCode",
                    attempts
            `,
            [
                input.token,
                input.now + input.leaseDurationMicros,
                input.now,
                input.id,
                input.now,
                input.now,
            ],
        );
        if (row === null) {
            return null;
        }
        const unknownPayload = yield* Effect.try({
            try: () => JSON.parse(row.payloadJson),
            catch: (cause) =>
                D1DecodeError.make({ cause, operation: 'decode' }),
        });
        const payload = yield* Schema.decodeUnknownEffect(
            SocialPayloadSnapshot,
        )(unknownPayload).pipe(
            Effect.mapError((cause) =>
                D1DecodeError.make({ cause, operation: 'decode' }),
            ),
        );
        return {
            attempts: row.attempts,
            id: row.id,
            lastErrorCode: row.lastErrorCode,
            payload,
            provider: row.provider,
        };
    });

    const getStatus = Effect.fn('SocialRepository.getStatus')((id: string) =>
        d1Store.first(
            SocialDeliveryStatus,
            `
                SELECT
                    state,
                    available_at AS "availableAt",
                    lease_expires_at AS "leaseExpiresAt"
                FROM social_deliveries
                WHERE id = ?
            `,
            [id],
        ),
    );

    const complete = Effect.fn('SocialRepository.complete')(function* (input: {
        readonly id: string;
        readonly now: number;
        readonly remoteId: string;
        readonly token: string;
    }) {
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = 'delivered',
                        remote_id = ?,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [
                    input.remoteId,
                    input.now,
                    input.now,
                    input.id,
                    input.token,
                ],
            },
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = 'completed',
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [input.now, input.now, input.id, input.token],
            },
        ]);
        return results.every((result) => result.changes === 1);
    });

    const release = Effect.fn('SocialRepository.release')(function* (input: {
        readonly availableAt: number;
        readonly errorCode: string;
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) {
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = 'retrying',
                        available_at = ?,
                        last_error_code = ?,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [
                    input.availableAt,
                    input.errorCode,
                    input.now,
                    input.id,
                    input.token,
                ],
            },
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = 'retrying',
                        available_at = ?,
                        last_error_code = ?,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [
                    input.availableAt,
                    input.errorCode,
                    input.now,
                    input.id,
                    input.token,
                ],
            },
        ]);
        return results.every((result) => result.changes === 1);
    });

    const fail = Effect.fn('SocialRepository.fail')(function* (input: {
        readonly errorCode: string;
        readonly id: string;
        readonly needsReview: boolean;
        readonly now: number;
        readonly token: string;
    }) {
        const state = input.needsReview ? 'needs_review' : 'failed';
        const results = yield* d1Store.batch([
            {
                sql: `
                    UPDATE social_deliveries
                    SET
                        state = ?,
                        last_error_code = ?,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [
                    state,
                    input.errorCode,
                    input.now,
                    input.now,
                    input.id,
                    input.token,
                ],
            },
            {
                sql: `
                    UPDATE jobs
                    SET
                        state = ?,
                        last_error_code = ?,
                        lease_token = NULL,
                        lease_expires_at = NULL,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state = 'processing' AND lease_token = ?
                `,
                parameters: [
                    state,
                    input.errorCode,
                    input.now,
                    input.now,
                    input.id,
                    input.token,
                ],
            },
        ]);
        return results.every((result) => result.changes === 1);
    });

    return { claim, complete, fail, getStatus, release };
}
