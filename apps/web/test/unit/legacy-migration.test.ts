import { makeEncryption } from '@gongyu/integrations/encryption';
import {
    createLegacyMigrationBackup,
    decryptLaravelString,
} from '@gongyu/jobs/legacy-migration';
import { Effect } from 'effect';
import { assert, expect, it } from 'vitest';

const DESTINATION_KEYRING =
    '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}';

function base64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
    return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
}

function hex(value: ArrayBuffer): string {
    return Array.from(new Uint8Array(value), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

async function encryptLaravelString(
    plaintext: string,
    rawKey: Uint8Array,
): Promise<string> {
    const iv = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const encryptionKey = await crypto.subtle.importKey(
        'raw',
        arrayBuffer(rawKey),
        { name: 'AES-CBC' },
        false,
        ['encrypt'],
    );
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { iv: arrayBuffer(iv), name: 'AES-CBC' },
            encryptionKey,
            arrayBuffer(new TextEncoder().encode(plaintext)),
        ),
    );
    const ivBase64 = base64(iv);
    const valueBase64 = base64(ciphertext);
    const hmacKey = await crypto.subtle.importKey(
        'raw',
        arrayBuffer(rawKey),
        { hash: 'SHA-256', name: 'HMAC' },
        false,
        ['sign'],
    );
    const mac = hex(
        await crypto.subtle.sign(
            'HMAC',
            hmacKey,
            arrayBuffer(new TextEncoder().encode(`${ivBase64}${valueBase64}`)),
        ),
    );
    return base64(
        new TextEncoder().encode(
            JSON.stringify({ iv: ivBase64, mac, tag: '', value: valueBase64 }),
        ),
    );
}

it('preserves PostgreSQL microseconds and re-encrypts Laravel settings', async () => {
    const rawKey = Uint8Array.from({ length: 32 }, (_, index) => index);
    const appKey = `base64:${base64(rawKey)}`;
    const legacyCiphertext = await encryptLaravelString(
        'legacy-secret',
        rawKey,
    );
    const backup = await createLegacyMigrationBackup({
        destinationKeyring: DESTINATION_KEYRING,
        destinationRpId: 'gongyu.example',
        legacyAppKey: appKey,
        source: {
            bookmarks: [
                {
                    created_at: '2025-12-23T15:03:38.123456Z',
                    description: 'Exact migration fixture',
                    id: 42,
                    shaarli_short_url: 'AbCd12',
                    short_url: 'AbCd1234',
                    thumbnail_url: 'https://images.example/legacy.png',
                    title: 'Legacy bookmark',
                    updated_at: '2025-12-23T15:03:39.654321+00:00',
                    url: 'https://example.com/exact?x=1',
                },
            ],
            exported_at: '2026-01-01T00:00:00.000001Z',
            settings: [
                {
                    encrypted: true,
                    key: 'twitter_api_key',
                    updated_at: '2025-12-23T15:03:40.000007Z',
                    value: legacyCiphertext,
                },
            ],
            version: 1,
        },
    });

    assert.strictEqual(backup.bookmarks[0]?.createdAt, 1_766_502_218_123_456);
    assert.strictEqual(backup.bookmarks[0]?.updatedAt, 1_766_502_219_654_321);
    assert.strictEqual(backup.settings[0]?.updatedAt, 1_766_502_220_000_007);
    assert.strictEqual(backup.bookmarks[0]?.id, 42);
    assert.strictEqual(backup.bookmarks[0]?.shortUrl, 'AbCd1234');
    assert.strictEqual(backup.bookmarks[0]?.shaarliShortUrl, 'AbCd12');
    assert.match(backup.dataSha256, /^[a-f0-9]{64}$/u);
    assert.strictEqual(backup.passkey, null);

    const destinationEncryption = makeEncryption(DESTINATION_KEYRING);
    assert.strictEqual(
        await Effect.runPromise(
            destinationEncryption.decrypt(
                backup.settings[0]?.encryptedValue ?? '',
            ),
        ),
        'legacy-secret',
    );
    assert.strictEqual(
        await decryptLaravelString(legacyCiphertext, appKey),
        'legacy-secret',
    );
});

it('rejects tampered Laravel ciphertext and unsafe bookmark URLs', async () => {
    const rawKey = new Uint8Array(32);
    const appKey = `base64:${base64(rawKey)}`;
    const ciphertext = await encryptLaravelString('secret', rawKey);
    const payload = JSON.parse(
        new TextDecoder().decode(
            Uint8Array.from(atob(ciphertext), (character) =>
                character.charCodeAt(0),
            ),
        ),
    ) as { iv: string; mac: string; tag: string; value: string };
    payload.mac = `${payload.mac.slice(0, -1)}0`;
    const tampered = base64(new TextEncoder().encode(JSON.stringify(payload)));
    await expect(decryptLaravelString(tampered, appKey)).rejects.toThrow(
        /authentication failed/u,
    );
    await expect(
        createLegacyMigrationBackup({
            destinationKeyring: DESTINATION_KEYRING,
            destinationRpId: 'gongyu.example',
            legacyAppKey: appKey,
            source: {
                bookmarks: [
                    {
                        created_at: '2025-01-01T00:00:00Z',
                        description: null,
                        id: 1,
                        shaarli_short_url: null,
                        short_url: 'AbCd1234',
                        thumbnail_url: null,
                        title: 'Unsafe',
                        updated_at: '2025-01-01T00:00:00Z',
                        url: 'javascript:alert(1)',
                    },
                ],
                exported_at: '2025-01-01T00:00:00Z',
                settings: [],
                version: 1,
            },
        }),
    ).rejects.toThrow(/Unsafe legacy bookmark URL/u);
});
