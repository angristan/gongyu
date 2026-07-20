import { Schema } from 'effect';

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const ShortUrl = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]{8}$/u));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const ImageContentType = Schema.Union([
    Schema.Literal('image/jpeg'),
    Schema.Literal('image/png'),
    Schema.Literal('image/webp'),
]);
const ThumbnailKey = Schema.String.check(
    Schema.isPattern(
        /^thumbnails\/[A-Za-z0-9]{8}\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u,
    ),
);

export class BackupBookmark extends Schema.Class<BackupBookmark>(
    'BackupBookmark',
)({
    createdAt: Schema.Number,
    description: Schema.NullOr(Schema.String),
    id: PositiveInt,
    shaarliShortUrl: Schema.NullOr(Schema.String),
    shortUrl: ShortUrl,
    thumbnailContentType: Schema.NullOr(ImageContentType),
    thumbnailHeight: Schema.NullOr(Schema.Number),
    thumbnailKey: Schema.NullOr(ThumbnailKey),
    thumbnailSha256: Schema.NullOr(Schema.String),
    thumbnailSize: Schema.NullOr(Schema.Number),
    thumbnailUrl: Schema.NullOr(Schema.String),
    thumbnailWidth: Schema.NullOr(Schema.Number),
    title: Schema.String,
    updatedAt: Schema.Number,
    url: Schema.String,
}) {}

export const BackupSettingKey = Schema.Union([
    Schema.Literal('bluesky_app_password'),
    Schema.Literal('bluesky_handle'),
    Schema.Literal('feed_count'),
    Schema.Literal('mastodon_access_token'),
    Schema.Literal('mastodon_instance'),
    Schema.Literal('twitter_access_secret'),
    Schema.Literal('twitter_access_token'),
    Schema.Literal('twitter_api_key'),
    Schema.Literal('twitter_api_secret'),
]);

export class BackupSetting extends Schema.Class<BackupSetting>('BackupSetting')(
    {
        encryptedValue: Schema.NullOr(Schema.String),
        key: BackupSettingKey,
        updatedAt: Schema.Number,
    },
) {}

export class BackupPasskey extends Schema.Class<BackupPasskey>('BackupPasskey')(
    {
        counter: NonNegativeInt,
        createdAt: Schema.Number,
        credentialBackedUp: Schema.Union([
            Schema.Literal(0),
            Schema.Literal(1),
        ]),
        credentialDeviceType: Schema.Union([
            Schema.Literal('singleDevice'),
            Schema.Literal('multiDevice'),
        ]),
        credentialId: Schema.String.check(
            Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
        ),
        lastUsedAt: Schema.NullOr(Schema.Number),
        publicKeyHex: Schema.String.check(
            Schema.isPattern(/^(?:[a-f0-9]{2})+$/u),
        ),
        transportsJson: Schema.String,
        userId: Schema.String.check(Schema.isMinLength(1)),
    },
) {}

export class BackupObject extends Schema.Class<BackupObject>('BackupObject')({
    backupKey: Schema.String,
    contentType: ImageContentType,
    dataBase64: Schema.String,
    sha256: Sha256,
    size: NonNegativeInt,
    sourceKey: ThumbnailKey,
}) {}

export interface FullBackupData {
    readonly bookmarks: unknown;
    readonly createdAt: string;
    readonly encryptionKeyVersions: unknown;
    readonly objects: unknown;
    readonly passkey: unknown;
    readonly rpId: string;
    readonly settings: unknown;
}

export function fullBackupDataBytes(input: FullBackupData): Uint8Array {
    return new TextEncoder().encode(
        JSON.stringify({
            bookmarks: input.bookmarks,
            createdAt: input.createdAt,
            encryptionKeyVersions: input.encryptionKeyVersions,
            format: 'gongyu-full-backup',
            objects: input.objects,
            passkey: input.passkey,
            rpId: input.rpId,
            schemaVersion: 1,
            settings: input.settings,
            timestampUnit: 'unix-microseconds',
        }),
    );
}

export class FullBackupV1 extends Schema.Class<FullBackupV1>('FullBackupV1')({
    bookmarks: Schema.Array(BackupBookmark),
    createdAt: Schema.String,
    dataSha256: Sha256,
    encryptionKeyVersions: Schema.Array(Schema.Number),
    format: Schema.Literal('gongyu-full-backup'),
    objects: Schema.Array(BackupObject),
    passkey: Schema.NullOr(BackupPasskey),
    rpId: Schema.String,
    schemaVersion: Schema.Literal(1),
    settings: Schema.Array(BackupSetting),
    timestampUnit: Schema.Literal('unix-microseconds'),
}) {}
