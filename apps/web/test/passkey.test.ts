import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    beginAuthentication,
    beginRegistration,
    finishRegistration,
    PasskeyError,
} from '@gongyu/auth/service';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { cose, isoBase64URL, isoCrypto } from '@simplewebauthn/server/helpers';
import { Effect, Layer } from 'effect';

const configuration = {
    origin: 'https://gongyu.test',
    rpId: 'gongyu.test',
};

const noneAttestationChallenge = isoBase64URL.fromUTF8String(
    'hEccPWuziP00H0p5gxh2_u5_PC4NeYgd',
);
const noneAttestation: RegistrationResponseJSON = {
    clientExtensionResults: {},
    id: 'AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY',
    rawId: 'AdKXJEch1aV5Wo7bj7qLHskVY4OoNaj9qu8TPdJ7kSAgUeRxWNngXlcNIGt4gexZGKVGcqZpqqWordXb_he1izY',
    response: {
        attestationObject:
            'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVjFPdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KBFAAAAAAAAAAAAAAAAAAAAAAAAAAAAQQHSlyRHIdWleVqO24-6ix7JFWODqDWo_arvEz3Se5EgIFHkcVjZ4F5XDSBreIHsWRilRnKmaaqlqK3V2_4XtYs2pQECAyYgASFYID5PQTZQQg6haZFQWFzqfAOyQ_ENsMH8xxQ4GRiNPsqrIlggU8IVUOV8qpgk_Jh-OTaLuZL52KdX1fTht07X4DiQPow',
        clientDataJSON:
            'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiYUVWalkxQlhkWHBwVURBd1NEQndOV2Q0YURKZmRUVmZVRU0wVG1WWloyUSIsIm9yaWdpbiI6Imh0dHBzOlwvXC9kZXYuZG9udG5lZWRhLnB3IiwiYW5kcm9pZFBhY2thZ2VOYW1lIjoib3JnLm1vemlsbGEuZmlyZWZveCJ9',
        transports: [],
    },
    type: 'public-key',
};

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);

it.layer(D1StoreTest)('SimpleWebAuthn on Workerd', (it) => {
    it.effect('generates discoverable single-passkey options', () =>
        Effect.gen(function* () {
            const registration = yield* beginRegistration(configuration);

            assert.strictEqual(registration.options.rp.id, 'gongyu.test');
            assert.strictEqual(
                registration.options.authenticatorSelection?.residentKey,
                'required',
            );
            assert.strictEqual(
                registration.options.authenticatorSelection?.userVerification,
                'required',
            );
            assert.isAbove(registration.options.challenge.length, 20);
        }),
    );

    it.effect('requires a registered credential for authentication', () =>
        Effect.gen(function* () {
            const failure = yield* beginAuthentication(configuration).pipe(
                Effect.flip,
            );

            assert.instanceOf(failure, PasskeyError);
            if (failure instanceof PasskeyError) {
                assert.strictEqual(failure.code, 'not_registered');
            }
        }),
    );

    it.effect('rejects an expired challenge before verification', () =>
        Effect.gen(function* () {
            const d1Store = yield* D1Store;
            yield* d1Store.run(
                `
                    INSERT INTO phase0_webauthn_challenges (
                        id,
                        ceremony,
                        challenge,
                        user_id,
                        expires_at
                    )
                    VALUES (?, 'registration', ?, ?, 0)
                `,
                ['expired', noneAttestationChallenge, 'admin-user-id'],
            );

            const failure = yield* finishRegistration(configuration, {
                ceremonyId: 'expired',
                response: noneAttestation,
            }).pipe(Effect.flip);
            assert.instanceOf(failure, PasskeyError);
            if (failure instanceof PasskeyError) {
                assert.strictEqual(failure.code, 'invalid_challenge');
            }
        }),
    );

    it.effect('consumes a failed registration challenge exactly once', () =>
        Effect.gen(function* () {
            const registration = yield* beginRegistration(configuration);
            const invalidResponse = {
                ceremonyId: registration.ceremonyId,
                response: {
                    clientExtensionResults: {},
                    id: 'aA',
                    rawId: 'aA',
                    response: {
                        attestationObject: 'AA',
                        clientDataJSON: isoBase64URL.fromUTF8String(
                            JSON.stringify({
                                challenge: registration.options.challenge,
                                crossOrigin: false,
                                origin: configuration.origin,
                                type: 'webauthn.create',
                            }),
                        ),
                    },
                    type: 'public-key',
                },
            };

            const verificationFailure = yield* finishRegistration(
                configuration,
                invalidResponse,
            ).pipe(Effect.flip);
            assert.instanceOf(verificationFailure, PasskeyError);
            if (verificationFailure instanceof PasskeyError) {
                assert.strictEqual(
                    verificationFailure.code,
                    'verification_failed',
                );
            }

            const replayFailure = yield* finishRegistration(
                configuration,
                invalidResponse,
            ).pipe(Effect.flip);
            assert.instanceOf(replayFailure, PasskeyError);
            if (replayFailure instanceof PasskeyError) {
                assert.strictEqual(replayFailure.code, 'invalid_challenge');
            }
        }),
    );
});

it.effect('rejects a valid registration for the wrong challenge', () =>
    Effect.gen(function* () {
        const failure = yield* Effect.tryPromise(() =>
            verifyRegistrationResponse({
                expectedChallenge: 'wrong-challenge',
                expectedOrigin: 'https://dev.dontneeda.pw',
                expectedRPID: 'dev.dontneeda.pw',
                response: noneAttestation,
            }),
        ).pipe(Effect.flip);

        assert.instanceOf(failure, Error);
    }),
);

it.effect('rejects a valid registration for the wrong RP ID', () =>
    Effect.gen(function* () {
        const failure = yield* Effect.tryPromise(() =>
            verifyRegistrationResponse({
                expectedChallenge: noneAttestationChallenge,
                expectedOrigin: 'https://dev.dontneeda.pw',
                expectedRPID: 'wrong.dontneeda.pw',
                response: noneAttestation,
            }),
        ).pipe(Effect.flip);

        assert.instanceOf(failure, Error);
    }),
);

it.effect('verifies Ed25519 signatures through SimpleWebAuthn', () =>
    Effect.gen(function* () {
        const publicKey: cose.COSEPublicKeyOKP = new Map();
        publicKey.set(cose.COSEKEYS.kty, cose.COSEKTY.OKP);
        publicKey.set(cose.COSEKEYS.alg, cose.COSEALG.EdDSA);
        publicKey.set(cose.COSEKEYS.crv, cose.COSECRV.ED25519);
        publicKey.set(
            cose.COSEKEYS.x,
            isoBase64URL.toBuffer(
                'bN-2dTH53XfUq55T1RkvXMpwHV0dRVnMBPxuOBm1-vI',
            ),
        );

        const verified = yield* Effect.promise(() =>
            isoCrypto.verify({
                cosePublicKey: publicKey,
                data: isoBase64URL.toBuffer(
                    'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NBAAAAMpHf6teVnkR1rSabDUgr4IkAIBqlqljErWIWWTGYn6Lqjsb8p3djr7sVZW7WYoECyh5xpAEBAycgBiFYIGzftnUx-d131KueU9UZL1zKcB1dHUVZzAT8bjgZtfrytEHOGqAdESuKacg0dIwKWfEP8VP4or6CINxkD5qWQYw',
                ),
                signature: isoBase64URL.toBuffer(
                    'HdoQloEiGSUHf9dJXbVzyWNbDh0K25tpNQQpj5hrkhCcdfz0pCBPtqChka_4kfIbhf6JyY1EGAuf9pQdwqJVBQ',
                ),
            }),
        );

        assert.isTrue(verified);
    }),
);
