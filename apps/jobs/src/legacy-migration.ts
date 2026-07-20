import {
    BackupBookmark,
    BackupSetting,
    BackupSettingKey,
    FullBackupV1,
    fullBackupDataBytes,
} from '@gongyu/domain/backup';
import {
    isSafeBookmarkUrl,
    timestampToMicros,
} from '@gongyu/domain/portability';
import {
    encryptionKeyVersions,
    makeEncryption,
} from '@gongyu/integrations/encryption';
import { Effect, Schema } from 'effect';

export class LegacyMigrationBookmark extends Schema.Class<LegacyMigrationBookmark>(
    'LegacyMigrationBookmark',
)({
    created_at: Schema.String,
    description: Schema.NullOr(Schema.String),
    id: Schema.Int,
    shaarli_short_url: Schema.NullOr(Schema.String),
    short_url: Schema.String,
    thumbnail_url: Schema.NullOr(Schema.String),
    title: Schema.String,
    updated_at: Schema.String,
    url: Schema.String,
}) {}

export class LegacyMigrationSetting extends Schema.Class<LegacyMigrationSetting>(
    'LegacyMigrationSetting',
)({
    encrypted: Schema.Boolean,
    key: BackupSettingKey,
    updated_at: Schema.String,
    value: Schema.NullOr(Schema.String),
}) {}

export class LegacyMigrationSource extends Schema.Class<LegacyMigrationSource>(
    'LegacyMigrationSource',
)({
    bookmarks: Schema.Array(LegacyMigrationBookmark),
    exported_at: Schema.String,
    settings: Schema.Array(LegacyMigrationSetting),
    version: Schema.Literal(1),
}) {}

function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
    return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
}

function encodeHex(value: ArrayBuffer): string {
    return Array.from(new Uint8Array(value), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

function secureEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
}

async function laravelKey(appKey: string): Promise<Uint8Array> {
    const encoded = appKey.startsWith('base64:')
        ? appKey.slice('base64:'.length)
        : null;
    const key =
        encoded === null
            ? new TextEncoder().encode(appKey)
            : decodeBase64(encoded);
    if (key.byteLength !== 32) {
        throw new Error('LEGACY_APP_KEY must contain a 32-byte AES-256 key.');
    }
    return key;
}

export async function decryptLaravelString(
    encrypted: string,
    appKey: string,
): Promise<string> {
    const keyBytes = await laravelKey(appKey);
    let payload: {
        readonly iv: string;
        readonly mac: string;
        readonly tag?: string;
        readonly value: string;
    };
    try {
        payload = JSON.parse(
            new TextDecoder().decode(decodeBase64(encrypted)),
        ) as typeof payload;
    } catch {
        throw new Error('Legacy setting ciphertext is invalid.');
    }
    if (
        typeof payload.iv !== 'string' ||
        typeof payload.value !== 'string' ||
        typeof payload.mac !== 'string' ||
        (payload.tag !== undefined && payload.tag !== '')
    ) {
        throw new Error(
            'Only Laravel AES-256-CBC string ciphertext is supported.',
        );
    }
    const hmacKey = await crypto.subtle.importKey(
        'raw',
        arrayBuffer(keyBytes),
        { hash: 'SHA-256', name: 'HMAC' },
        false,
        ['sign'],
    );
    const expectedMac = encodeHex(
        await crypto.subtle.sign(
            'HMAC',
            hmacKey,
            arrayBuffer(
                new TextEncoder().encode(`${payload.iv}${payload.value}`),
            ),
        ),
    );
    if (!secureEqual(expectedMac, payload.mac.toLowerCase())) {
        throw new Error('Legacy setting ciphertext authentication failed.');
    }
    const key = await crypto.subtle.importKey(
        'raw',
        arrayBuffer(keyBytes),
        { name: 'AES-CBC' },
        false,
        ['decrypt'],
    );
    try {
        const plaintext = await crypto.subtle.decrypt(
            { iv: arrayBuffer(decodeBase64(payload.iv)), name: 'AES-CBC' },
            key,
            arrayBuffer(decodeBase64(payload.value)),
        );
        return new TextDecoder().decode(plaintext);
    } catch {
        throw new Error('Legacy setting ciphertext could not be decrypted.');
    }
}

function migrationTimestamp(value: string): number {
    const timestamp = timestampToMicros(value, Number.NaN);
    if (!Number.isSafeInteger(timestamp)) {
        throw new Error(`Invalid legacy timestamp: ${value}`);
    }
    return timestamp;
}

async function sha256(value: Uint8Array): Promise<string> {
    return encodeHex(
        await crypto.subtle.digest('SHA-256', value.buffer as ArrayBuffer),
    );
}

export async function createLegacyMigrationBackup(input: {
    readonly destinationKeyring: string;
    readonly destinationRpId: string;
    readonly legacyAppKey: string;
    readonly source: unknown;
}): Promise<FullBackupV1> {
    const source = await Schema.decodeUnknownPromise(LegacyMigrationSource)(
        input.source,
    );
    const encryption = makeEncryption(input.destinationKeyring);
    const settings: BackupSetting[] = [];
    for (const setting of source.settings) {
        const plaintext =
            setting.value === null
                ? null
                : setting.encrypted
                  ? await decryptLaravelString(
                        setting.value,
                        input.legacyAppKey,
                    )
                  : setting.value;
        settings.push(
            BackupSetting.make({
                encryptedValue:
                    plaintext === null
                        ? null
                        : await Effect.runPromise(
                              encryption.encrypt(plaintext),
                          ),
                key: setting.key,
                updatedAt: migrationTimestamp(setting.updated_at),
            }),
        );
    }
    const bookmarks = source.bookmarks.map((bookmark) => {
        if (!isSafeBookmarkUrl(bookmark.url)) {
            throw new Error(
                `Unsafe legacy bookmark URL for ID ${bookmark.id}.`,
            );
        }
        return BackupBookmark.make({
            createdAt: migrationTimestamp(bookmark.created_at),
            description: bookmark.description,
            id: bookmark.id,
            shaarliShortUrl: bookmark.shaarli_short_url,
            shortUrl: bookmark.short_url,
            thumbnailContentType: null,
            thumbnailHeight: null,
            thumbnailKey: null,
            thumbnailSha256: null,
            thumbnailSize: null,
            thumbnailUrl: bookmark.thumbnail_url,
            thumbnailWidth: null,
            title: bookmark.title,
            updatedAt: migrationTimestamp(bookmark.updated_at),
            url: bookmark.url,
        });
    });
    const createdAt = new Date(
        Math.floor(migrationTimestamp(source.exported_at) / 1_000),
    ).toISOString();
    const keyVersions = await Effect.runPromise(
        encryptionKeyVersions(input.destinationKeyring),
    );
    const data = {
        bookmarks,
        createdAt,
        encryptionKeyVersions: keyVersions,
        objects: [],
        passkey: null,
        rpId: `legacy-migration:${input.destinationRpId}`,
        settings,
    };
    return Schema.decodeUnknownPromise(FullBackupV1)({
        ...data,
        dataSha256: await sha256(fullBackupDataBytes(data)),
        format: 'gongyu-full-backup',
        schemaVersion: 1,
        timestampUnit: 'unix-microseconds',
    });
}
