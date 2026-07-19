import { Settings } from '@gongyu/domain/settings';
import type {
    Encryption,
    EncryptionError,
} from '@gongyu/integrations/encryption';
import { Context, Effect, Schema } from 'effect';
import type { D1Store, D1StoreFailure } from './d1-store';

class SettingRow extends Schema.Class<SettingRow>('SettingRow')({
    encryptedValue: Schema.NullOr(Schema.String),
    key: Schema.String,
}) {}

export interface SettingsRepositoryShape {
    readonly get: Effect.Effect<Settings, D1StoreFailure | EncryptionError>;
    readonly save: (
        settings: Settings,
        updatedAt: number,
    ) => Effect.Effect<void, D1StoreFailure | EncryptionError>;
}

export class SettingsRepository extends Context.Service<
    SettingsRepository,
    SettingsRepositoryShape
>()('@gongyu/data/SettingsRepository') {}

export function makeSettingsRepository(
    d1Store: D1Store['Service'],
    encryption: Encryption['Service'],
): SettingsRepositoryShape {
    const get = Effect.gen(function* () {
        const result = yield* d1Store.query(
            SettingRow,
            'SELECT key, encrypted_value AS "encryptedValue" FROM settings',
        );
        const encrypted = new Map(
            result.rows.map((row) => [row.key, row.encryptedValue]),
        );
        const read = Effect.fn('SettingsRepository.decrypt')(function* (
            key: string,
        ) {
            const value = encrypted.get(key);
            return value === undefined || value === null
                ? ''
                : yield* encryption.decrypt(value);
        });
        const feedCountValue = yield* read('feed_count');
        const feedCount = Number.parseInt(feedCountValue, 10);

        return Settings.make({
            blueskyAppPassword: yield* read('bluesky_app_password'),
            blueskyHandle: yield* read('bluesky_handle'),
            feedCount:
                Number.isFinite(feedCount) && feedCount > 0 ? feedCount : 50,
            mastodonAccessToken: yield* read('mastodon_access_token'),
            mastodonInstance: yield* read('mastodon_instance'),
            twitterAccessSecret: yield* read('twitter_access_secret'),
            twitterAccessToken: yield* read('twitter_access_token'),
            twitterApiKey: yield* read('twitter_api_key'),
            twitterApiSecret: yield* read('twitter_api_secret'),
        });
    }).pipe(Effect.withSpan('SettingsRepository.get'));

    const save = Effect.fn('SettingsRepository.save')(function* (
        settings: Settings,
        updatedAt: number,
    ) {
        const values = [
            { key: 'twitter_api_key', value: settings.twitterApiKey },
            { key: 'twitter_api_secret', value: settings.twitterApiSecret },
            {
                key: 'twitter_access_token',
                value: settings.twitterAccessToken,
            },
            {
                key: 'twitter_access_secret',
                value: settings.twitterAccessSecret,
            },
            { key: 'mastodon_instance', value: settings.mastodonInstance },
            {
                key: 'mastodon_access_token',
                value: settings.mastodonAccessToken,
            },
            { key: 'bluesky_handle', value: settings.blueskyHandle },
            {
                key: 'bluesky_app_password',
                value: settings.blueskyAppPassword,
            },
            { key: 'feed_count', value: String(settings.feedCount) },
        ];
        const encryptedValues = yield* Effect.all(
            values.map((entry) =>
                entry.value === ''
                    ? Effect.succeed({ key: entry.key, value: null })
                    : encryption.encrypt(entry.value).pipe(
                          Effect.map((value) => ({
                              key: entry.key,
                              value,
                          })),
                      ),
            ),
            { concurrency: 1 },
        );
        yield* d1Store.batch(
            encryptedValues.map((entry) => ({
                parameters: [entry.key, entry.value, updatedAt],
                sql: `
                    INSERT INTO settings (key, encrypted_value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        encrypted_value = excluded.encrypted_value,
                        updated_at = excluded.updated_at
                `,
            })),
        );
    });

    return { get, save };
}
