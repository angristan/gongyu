import {
    SocialPayloadSnapshot,
    SocialProvider,
    SocialSourceSnapshot,
} from '@gongyu/domain/social';
import { Context, Effect, Schema } from 'effect';
import {
    D1DecodeError,
    type D1Statement,
    type D1Store,
    type D1StoreFailure,
} from './d1-store';

class ClaimedSocialRow extends Schema.Class<ClaimedSocialRow>(
    'ClaimedSocialRow',
)({
    attempts: Schema.Number,
    id: Schema.String,
    lastErrorCode: Schema.NullOr(Schema.String),
    payloadJson: Schema.String,
    provider: SocialProvider,
}) {}

class WaitingSocialRow extends Schema.Class<WaitingSocialRow>(
    'WaitingSocialRow',
)({
    id: Schema.String,
    provider: SocialProvider,
    sourceJson: Schema.String,
}) {}

export class SocialDeliveryStatus extends Schema.Class<SocialDeliveryStatus>(
    'SocialDeliveryStatus',
)({
    availableAt: Schema.Number,
    leaseExpiresAt: Schema.NullOr(Schema.Number),
    state: Schema.String,
}) {}

export interface WaitingSocialDelivery {
    readonly id: string;
    readonly provider: SocialProvider;
    readonly source: SocialSourceSnapshot;
}

export type SocialStagingOutcome =
    | {
          readonly errorCode: null;
          readonly id: string;
          readonly payload: SocialPayloadSnapshot;
      }
    | {
          readonly errorCode: string;
          readonly id: string;
          readonly payload: null;
      };

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
    readonly listWaiting: (
        bookmarkShortUrl: string,
    ) => Effect.Effect<ReadonlyArray<WaitingSocialDelivery>, D1StoreFailure>;
    readonly release: (input: {
        readonly availableAt: number;
        readonly errorCode: string;
        readonly id: string;
        readonly now: number;
        readonly token: string;
    }) => Effect.Effect<boolean, D1StoreFailure>;
    readonly stage: (input: {
        readonly bookmarkShortUrl: string;
        readonly finalizedAt: number;
        readonly now: number;
        readonly outcomes: ReadonlyArray<SocialStagingOutcome>;
    }) => Effect.Effect<number, D1StoreFailure>;
}

export class SocialRepository extends Context.Service<
    SocialRepository,
    SocialRepositoryShape
>()('@gongyu/data/SocialRepository') {}

export function makeSocialRepository(
    d1Store: D1Store['Service'],
): SocialRepositoryShape {
    const listWaiting = Effect.fn('SocialRepository.listWaiting')(function* (
        bookmarkShortUrl: string,
    ) {
        const rows = yield* d1Store.query(
            WaitingSocialRow,
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
            [bookmarkShortUrl],
        );
        const deliveries: WaitingSocialDelivery[] = [];
        for (const row of rows.rows) {
            const unknownSource = yield* Effect.try({
                try: () => JSON.parse(row.sourceJson),
                catch: (cause) =>
                    D1DecodeError.make({ cause, operation: 'decode' }),
            });
            const source = yield* Schema.decodeUnknownEffect(
                SocialSourceSnapshot,
            )(unknownSource).pipe(
                Effect.mapError((cause) =>
                    D1DecodeError.make({ cause, operation: 'decode' }),
                ),
            );
            deliveries.push({ id: row.id, provider: row.provider, source });
        }
        return deliveries;
    });

    const stage = Effect.fn('SocialRepository.stage')(function* (input: {
        readonly bookmarkShortUrl: string;
        readonly finalizedAt: number;
        readonly now: number;
        readonly outcomes: ReadonlyArray<SocialStagingOutcome>;
    }) {
        if (input.outcomes.length === 0) {
            return 0;
        }
        const statements: D1Statement[] = [];
        const updateIndexes: number[] = [];
        for (const outcome of input.outcomes) {
            updateIndexes.push(statements.length);
            if (outcome.payload === null) {
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
                              AND metadata_state IN ('completed', 'failed')
                              AND metadata_attempted_at = ?
                          )
                    `,
                    parameters: [
                        outcome.errorCode,
                        input.now,
                        input.now,
                        outcome.id,
                        input.bookmarkShortUrl,
                        input.finalizedAt,
                    ],
                });
                continue;
            }
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
                              AND metadata_state IN ('completed', 'failed')
                              AND metadata_attempted_at = ?
                          )
                    `,
                    parameters: [
                        JSON.stringify(outcome.payload),
                        input.now,
                        outcome.id,
                        input.bookmarkShortUrl,
                        input.finalizedAt,
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
                            available_at,
                            created_at,
                            updated_at
                        )
                        SELECT ?, ?, 'social', 'pending', 1, ?, ?, ?
                        WHERE EXISTS (
                            SELECT 1 FROM social_deliveries
                            WHERE id = ?
                              AND bookmark_short_url = ?
                              AND state = 'queued'
                              AND updated_at = ?
                        )
                    `,
                    parameters: [
                        outcome.id,
                        input.bookmarkShortUrl,
                        input.now,
                        input.now,
                        input.now,
                        outcome.id,
                        input.bookmarkShortUrl,
                        input.now,
                    ],
                },
            );
        }
        const results = yield* d1Store.batch(statements);
        return updateIndexes.reduce(
            (count, index) => count + (results[index]?.changes ?? 0),
            0,
        );
    });

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

    return {
        claim,
        complete,
        fail,
        getStatus,
        listWaiting,
        release,
        stage,
    };
}
