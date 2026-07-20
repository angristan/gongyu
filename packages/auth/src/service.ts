import { D1Store } from '@gongyu/data/d1-store';
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { Clock, Effect, Schema } from 'effect';
import {
    AuthenticationVerificationRequest,
    RegistrationVerificationRequest,
} from './contracts';

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;

const AuthenticatorTransport = Schema.Union([
    Schema.Literal('ble'),
    Schema.Literal('cable'),
    Schema.Literal('hybrid'),
    Schema.Literal('internal'),
    Schema.Literal('nfc'),
    Schema.Literal('smart-card'),
    Schema.Literal('usb'),
]);
const AuthenticatorTransports = Schema.mutable(
    Schema.Array(AuthenticatorTransport),
);
const Byte = Schema.Int.check(Schema.isBetween({ maximum: 255, minimum: 0 }));

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}

class ChallengeRow extends Schema.Class<ChallengeRow>('ChallengeRow')({
    challenge: Schema.String,
    registrationMode: Schema.NullOr(Schema.String),
    userId: Schema.String,
}) {}

class PasskeyRow extends Schema.Class<PasskeyRow>('PasskeyRow')({
    counter: Schema.Number,
    credentialBackedUp: Schema.Number,
    credentialDeviceType: Schema.String,
    credentialId: Schema.String,
    publicKey: Schema.Array(Byte),
    transportsJson: Schema.String,
    userId: Schema.String,
}) {}

export class PasskeyError extends Schema.TaggedErrorClass<PasskeyError>()(
    'PasskeyError',
    {
        cause: Schema.optionalKey(Schema.Unknown),
        code: Schema.String,
        message: Schema.String,
    },
) {}

export interface PasskeyConfiguration {
    readonly origin: string;
    readonly rpId: string;
}

function makePasskeyError(
    code: string,
    message: string,
    cause?: unknown,
): PasskeyError {
    return PasskeyError.make({
        code,
        message,
        ...(cause === undefined ? {} : { cause }),
    });
}

export const hasPasskey = Effect.fn('Passkey.hasPasskey')(function* () {
    const d1Store = yield* D1Store;
    const row = yield* d1Store.first(
        CountRow,
        'SELECT COUNT(*) AS count FROM passkeys',
    );
    return (row?.count ?? 0) > 0;
});

const loadPasskey = Effect.fn('Passkey.loadPasskey')(function* (
    credentialId?: string,
) {
    const d1Store = yield* D1Store;
    const row = yield* d1Store.first(
        PasskeyRow,
        `
            SELECT
                user_id AS "userId",
                credential_id AS "credentialId",
                public_key AS "publicKey",
                counter,
                transports_json AS "transportsJson",
                credential_device_type AS "credentialDeviceType",
                credential_backed_up AS "credentialBackedUp"
            FROM passkeys
            WHERE singleton_id = 1
              AND (? IS NULL OR credential_id = ?)
        `,
        [credentialId ?? null, credentialId ?? null],
    );

    if (row === null) {
        return yield* Effect.fail(
            makePasskeyError(
                'not_registered',
                'No matching passkey is registered.',
            ),
        );
    }

    return row;
});

const storeChallenge = Effect.fn('Passkey.storeChallenge')(function* (input: {
    readonly ceremony: 'authentication' | 'registration';
    readonly challenge: string;
    readonly expiresAt: number;
    readonly id: string;
    readonly registrationMode?: 'replacement' | 'setup';
    readonly userId: string;
}) {
    const d1Store = yield* D1Store;
    const insert = {
        sql: `
            INSERT INTO webauthn_challenges (
                id,
                ceremony,
                registration_mode,
                challenge,
                user_id,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        parameters: [
            input.id,
            input.ceremony,
            input.registrationMode ?? null,
            input.challenge,
            input.userId,
            input.expiresAt,
        ],
    };
    if (input.ceremony === 'authentication') {
        yield* d1Store.batch([
            {
                sql: `DELETE FROM webauthn_challenges WHERE ceremony = 'authentication'`,
            },
            insert,
        ]);
    } else {
        yield* d1Store.run(insert.sql, insert.parameters);
    }
});

const consumeChallenge = Effect.fn('Passkey.consumeChallenge')(
    function* (input: {
        readonly ceremony: 'authentication' | 'registration';
        readonly id: string;
        readonly now: number;
    }) {
        const d1Store = yield* D1Store;
        const row = yield* d1Store.first(
            ChallengeRow,
            `
                UPDATE webauthn_challenges
                SET consumed_at = ?
                WHERE id = ?
                  AND ceremony = ?
                  AND consumed_at IS NULL
                  AND expires_at > ?
                RETURNING
                    challenge,
                    registration_mode AS "registrationMode",
                    user_id AS "userId"
            `,
            [input.now, input.id, input.ceremony, input.now],
        );

        if (row === null) {
            return yield* Effect.fail(
                makePasskeyError(
                    'invalid_challenge',
                    'The passkey challenge is missing, expired, or already used.',
                ),
            );
        }

        return row;
    },
);

export const beginRegistration = Effect.fn('Passkey.beginRegistration')(
    function* (
        configuration: PasskeyConfiguration,
        registrationMode: 'replacement' | 'setup' = 'setup',
    ) {
        const registered = yield* hasPasskey();
        if (registrationMode === 'setup' && registered) {
            return yield* Effect.fail(
                makePasskeyError(
                    'already_registered',
                    'A passkey is already registered.',
                ),
            );
        }
        if (registrationMode === 'replacement' && !registered) {
            return yield* Effect.fail(
                makePasskeyError(
                    'not_registered',
                    'No passkey is available to replace.',
                ),
            );
        }

        const now = yield* Clock.currentTimeMillis;
        const ceremonyId = crypto.randomUUID();
        const userId =
            registrationMode === 'replacement'
                ? (yield* loadPasskey()).userId
                : crypto.randomUUID();
        const options = yield* Effect.tryPromise({
            try: () =>
                generateRegistrationOptions({
                    attestationType: 'none',
                    authenticatorSelection: {
                        residentKey: 'required',
                        userVerification: 'required',
                    },
                    rpID: configuration.rpId,
                    rpName: 'Gongyu',
                    timeout: CHALLENGE_TTL_MS,
                    userDisplayName: 'admin',
                    userID: isoUint8Array.fromUTF8String(userId),
                    userName: 'admin',
                }),
            catch: (cause) =>
                makePasskeyError(
                    'options_failed',
                    'Registration options could not be generated.',
                    cause,
                ),
        });

        yield* storeChallenge({
            ceremony: 'registration',
            challenge: options.challenge,
            expiresAt: now + CHALLENGE_TTL_MS,
            id: ceremonyId,
            registrationMode,
            userId,
        });

        return { ceremonyId, options };
    },
);

export const finishRegistration = Effect.fn('Passkey.finishRegistration')(
    function* (
        configuration: PasskeyConfiguration,
        input: unknown,
        authorization: 'authenticated' | 'setup' = 'setup',
    ) {
        const request = yield* Schema.decodeUnknownEffect(
            RegistrationVerificationRequest,
        )(input).pipe(
            Effect.mapError((cause) =>
                makePasskeyError(
                    'invalid_payload',
                    'The registration response is invalid.',
                    cause,
                ),
            ),
        );
        const now = yield* Clock.currentTimeMillis;
        const challenge = yield* consumeChallenge({
            ceremony: 'registration',
            id: request.ceremonyId,
            now,
        });
        if (
            challenge.registrationMode === 'replacement' &&
            authorization !== 'authenticated'
        ) {
            return yield* Effect.fail(
                makePasskeyError(
                    'authentication_required',
                    'Authentication is required to replace the passkey.',
                ),
            );
        }
        const verification = yield* Effect.tryPromise({
            try: () =>
                verifyRegistrationResponse({
                    expectedChallenge: challenge.challenge,
                    expectedOrigin: configuration.origin,
                    expectedRPID: configuration.rpId,
                    requireUserVerification: true,
                    response: request.response,
                }),
            catch: (cause) =>
                makePasskeyError(
                    'verification_failed',
                    'Passkey registration could not be verified.',
                    cause,
                ),
        });

        if (!verification.verified) {
            return yield* Effect.fail(
                makePasskeyError(
                    'verification_failed',
                    'Passkey registration was not verified.',
                ),
            );
        }

        const { credential, credentialBackedUp, credentialDeviceType } =
            verification.registrationInfo;
        const d1Store = yield* D1Store;
        const credentialValues = [
            challenge.userId,
            credential.id,
            credential.publicKey,
            credential.counter,
            JSON.stringify(credential.transports ?? []),
            credentialDeviceType,
            credentialBackedUp ? 1 : 0,
            now,
        ];
        if (challenge.registrationMode === 'replacement') {
            const result = yield* d1Store.run(
                `
                    UPDATE passkeys
                    SET
                        user_id = ?,
                        credential_id = ?,
                        public_key = ?,
                        counter = ?,
                        transports_json = ?,
                        credential_device_type = ?,
                        credential_backed_up = ?,
                        created_at = ?,
                        last_used_at = NULL
                    WHERE singleton_id = 1
                `,
                credentialValues,
            );
            if (result.changes !== 1) {
                return yield* Effect.fail(
                    makePasskeyError(
                        'not_registered',
                        'No passkey is available to replace.',
                    ),
                );
            }
        } else {
            yield* d1Store
                .run(
                    `
                        INSERT INTO passkeys (
                            singleton_id,
                            user_id,
                            credential_id,
                            public_key,
                            counter,
                            transports_json,
                            credential_device_type,
                            credential_backed_up,
                            created_at
                        )
                        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    credentialValues,
                )
                .pipe(
                    Effect.mapError((error) =>
                        error.message.includes('UNIQUE constraint failed')
                            ? makePasskeyError(
                                  'already_registered',
                                  'A passkey is already registered.',
                              )
                            : error,
                    ),
                );
        }

        return {
            registrationMode:
                challenge.registrationMode === 'replacement'
                    ? 'replacement'
                    : 'setup',
            verified: true,
        };
    },
);

export const beginAuthentication = Effect.fn('Passkey.beginAuthentication')(
    function* (configuration: PasskeyConfiguration) {
        const passkey = yield* loadPasskey();
        const now = yield* Clock.currentTimeMillis;
        const ceremonyId = crypto.randomUUID();
        const options = yield* Effect.tryPromise({
            try: () =>
                generateAuthenticationOptions({
                    rpID: configuration.rpId,
                    timeout: CHALLENGE_TTL_MS,
                    userVerification: 'required',
                }),
            catch: (cause) =>
                makePasskeyError(
                    'options_failed',
                    'Authentication options could not be generated.',
                    cause,
                ),
        });

        yield* storeChallenge({
            ceremony: 'authentication',
            challenge: options.challenge,
            expiresAt: now + CHALLENGE_TTL_MS,
            id: ceremonyId,
            userId: passkey.userId,
        });

        return { ceremonyId, options };
    },
);

export const recoverAdministrator = Effect.fn('Passkey.recoverAdministrator')(
    function* (input: { readonly now: number; readonly requestId: string }) {
        const d1Store = yield* D1Store;
        yield* d1Store.batch([
            { sql: 'DELETE FROM sessions' },
            { sql: 'DELETE FROM webauthn_challenges' },
            { sql: 'DELETE FROM passkeys' },
            {
                sql: `
                    INSERT INTO audit_log (id, event, occurred_at, details_json)
                    VALUES (?, 'administrator_recovered', ?, ?)
                `,
                parameters: [
                    crypto.randomUUID(),
                    input.now,
                    JSON.stringify({ requestId: input.requestId }),
                ],
            },
        ]);
    },
);

export const finishAuthentication = Effect.fn('Passkey.finishAuthentication')(
    function* (configuration: PasskeyConfiguration, input: unknown) {
        const request = yield* Schema.decodeUnknownEffect(
            AuthenticationVerificationRequest,
        )(input).pipe(
            Effect.mapError((cause) =>
                makePasskeyError(
                    'invalid_payload',
                    'The authentication response is invalid.',
                    cause,
                ),
            ),
        );
        const now = yield* Clock.currentTimeMillis;
        const challenge = yield* consumeChallenge({
            ceremony: 'authentication',
            id: request.ceremonyId,
            now,
        });
        const passkey = yield* loadPasskey(request.response.id);
        const transports = yield* Effect.try({
            try: () => JSON.parse(passkey.transportsJson),
            catch: (cause) =>
                makePasskeyError(
                    'stored_credential_invalid',
                    'Stored passkey transports are invalid.',
                    cause,
                ),
        }).pipe(
            Effect.flatMap((value) =>
                Schema.decodeUnknownEffect(AuthenticatorTransports)(value),
            ),
            Effect.mapError((cause) =>
                cause instanceof PasskeyError
                    ? cause
                    : makePasskeyError(
                          'stored_credential_invalid',
                          'Stored passkey transports are invalid.',
                          cause,
                      ),
            ),
        );
        const { userHandle, ...authenticationResponseFields } =
            request.response.response;
        const authenticationResponse = {
            ...request.response,
            response:
                userHandle === null || userHandle === undefined
                    ? authenticationResponseFields
                    : { ...authenticationResponseFields, userHandle },
        };
        const verification = yield* Effect.tryPromise({
            try: () =>
                verifyAuthenticationResponse({
                    credential: {
                        counter: passkey.counter,
                        id: passkey.credentialId,
                        publicKey: new Uint8Array(passkey.publicKey),
                        transports,
                    },
                    expectedChallenge: challenge.challenge,
                    expectedOrigin: configuration.origin,
                    expectedRPID: configuration.rpId,
                    requireUserVerification: true,
                    response: authenticationResponse,
                }),
            catch: (cause) =>
                makePasskeyError(
                    'verification_failed',
                    'Passkey authentication could not be verified.',
                    cause,
                ),
        });

        if (!verification.verified) {
            return yield* Effect.fail(
                makePasskeyError(
                    'verification_failed',
                    'Passkey authentication was not verified.',
                ),
            );
        }

        const d1Store = yield* D1Store;
        const meta = yield* d1Store.run(
            `
                UPDATE passkeys
                SET
                    counter = ?,
                    credential_device_type = ?,
                    credential_backed_up = ?,
                    last_used_at = ?
                WHERE singleton_id = 1
                  AND counter = ?
            `,
            [
                verification.authenticationInfo.newCounter,
                verification.authenticationInfo.credentialDeviceType,
                verification.authenticationInfo.credentialBackedUp ? 1 : 0,
                now,
                passkey.counter,
            ],
        );

        if (meta.changes !== 1) {
            return yield* Effect.fail(
                makePasskeyError(
                    'counter_conflict',
                    'The passkey counter changed concurrently.',
                ),
            );
        }

        return { verified: true as const };
    },
);
