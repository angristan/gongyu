import { Context, Effect, Schema } from 'effect';

class EncryptionEnvelope extends Schema.Class<EncryptionEnvelope>(
    'EncryptionEnvelope',
)({
    ciphertext: Schema.String,
    iv: Schema.String,
    version: Schema.Number,
}) {}

class Keyring extends Schema.Class<Keyring>('EncryptionKeyring')({
    currentVersion: Schema.Number,
    keys: Schema.Record(Schema.String, Schema.String),
}) {}

export class EncryptionError extends Schema.TaggedErrorClass<EncryptionError>()(
    'EncryptionError',
    {
        code: Schema.String,
        message: Schema.String,
    },
) {}

export interface EncryptionShape {
    readonly decrypt: (value: string) => Effect.Effect<string, EncryptionError>;
    readonly encrypt: (value: string) => Effect.Effect<string, EncryptionError>;
}

export class Encryption extends Context.Service<Encryption, EncryptionShape>()(
    '@gongyu/integrations/Encryption',
) {}

function fail(code: string, message: string): EncryptionError {
    return EncryptionError.make({ code, message });
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function encodeBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

const decodeKeyring = Effect.fn('Encryption.decodeKeyring')(function* (
    serialized: string,
) {
    const unknownValue = yield* Effect.try({
        try: () => JSON.parse(serialized),
        catch: () =>
            fail('invalid_keyring', 'The encryption keyring is invalid.'),
    });
    return yield* Schema.decodeUnknownEffect(Keyring)(unknownValue).pipe(
        Effect.mapError(() =>
            fail('invalid_keyring', 'The encryption keyring is invalid.'),
        ),
    );
});

const importKey = Effect.fn('Encryption.importKey')(function* (
    encodedKey: string,
) {
    const bytes = yield* Effect.try({
        try: () => decodeBase64(encodedKey),
        catch: () => fail('invalid_key', 'An encryption key is invalid.'),
    });
    if (bytes.byteLength !== 32) {
        return yield* fail(
            'invalid_key',
            'Encryption keys must contain exactly 32 bytes.',
        );
    }
    return yield* Effect.tryPromise({
        try: () =>
            crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
                'decrypt',
                'encrypt',
            ]),
        catch: () => fail('invalid_key', 'An encryption key is invalid.'),
    });
});

export const encryptionKeyVersions = Effect.fn('Encryption.keyVersions')(
    function* (serializedKeyring: string) {
        const keyring = yield* decodeKeyring(serializedKeyring);
        return Object.keys(keyring.keys)
            .map((version) => Number.parseInt(version, 10))
            .filter(Number.isFinite)
            .sort((left, right) => left - right);
    },
);

export function makeEncryption(serializedKeyring: string): EncryptionShape {
    const encrypt = Effect.fn('Encryption.encrypt')(function* (value: string) {
        const keyring = yield* decodeKeyring(serializedKeyring);
        const encodedKey = keyring.keys[String(keyring.currentVersion)];
        if (encodedKey === undefined) {
            return yield* fail(
                'missing_current_key',
                'The current encryption key is unavailable.',
            );
        }
        const key = yield* importKey(encodedKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = yield* Effect.tryPromise({
            try: () =>
                crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv },
                    key,
                    new TextEncoder().encode(value),
                ),
            catch: () =>
                fail('encryption_failed', 'The value could not be encrypted.'),
        });
        return JSON.stringify(
            EncryptionEnvelope.make({
                ciphertext: encodeBase64(new Uint8Array(ciphertext)),
                iv: encodeBase64(iv),
                version: keyring.currentVersion,
            }),
        );
    });

    const decrypt = Effect.fn('Encryption.decrypt')(function* (value: string) {
        const unknownEnvelope = yield* Effect.try({
            try: () => JSON.parse(value),
            catch: () =>
                fail('invalid_ciphertext', 'The encrypted value is invalid.'),
        });
        const envelope = yield* Schema.decodeUnknownEffect(EncryptionEnvelope)(
            unknownEnvelope,
        ).pipe(
            Effect.mapError(() =>
                fail('invalid_ciphertext', 'The encrypted value is invalid.'),
            ),
        );
        const keyring = yield* decodeKeyring(serializedKeyring);
        const encodedKey = keyring.keys[String(envelope.version)];
        if (encodedKey === undefined) {
            return yield* fail(
                'missing_key_version',
                'The required encryption key version is unavailable.',
            );
        }
        const key = yield* importKey(encodedKey);
        const [iv, ciphertext] = yield* Effect.try({
            try: () => [
                decodeBase64(envelope.iv),
                decodeBase64(envelope.ciphertext),
            ],
            catch: () =>
                fail('invalid_ciphertext', 'The encrypted value is invalid.'),
        });
        const plaintext = yield* Effect.tryPromise({
            try: () =>
                crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
            catch: () =>
                fail('decryption_failed', 'The value could not be decrypted.'),
        });
        return new TextDecoder().decode(plaintext);
    });

    return { decrypt, encrypt };
}
