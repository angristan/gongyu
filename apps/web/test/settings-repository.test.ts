import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    makeSettingsRepository,
    SettingsRepository,
} from '@gongyu/data/settings-repository';
import { DEFAULT_LIBRARY_NAME, Settings } from '@gongyu/domain/settings';
import {
    Encryption,
    EncryptionError,
    makeEncryption,
} from '@gongyu/integrations/encryption';
import { Effect, Layer, Schema } from 'effect';

const keyring =
    '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}';
const rotatedKeyring =
    '{"currentVersion":2,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","2":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}}';

const D1StoreTest = Layer.effect(D1Store)(
    Effect.sync(() => makeD1Store(env.DB.withSession('first-primary'))),
);
const EncryptionTest = Layer.succeed(Encryption)(makeEncryption(keyring));
const SettingsRepositoryTest = Layer.effect(SettingsRepository)(
    Effect.gen(function* () {
        const d1Store = yield* D1Store;
        const encryption = yield* Encryption;
        return makeSettingsRepository(d1Store, encryption);
    }),
);
const TestLayer = Layer.provideMerge(
    SettingsRepositoryTest,
    Layer.mergeAll(D1StoreTest, EncryptionTest),
);

class StoredSetting extends Schema.Class<StoredSetting>('StoredSetting')({
    encryptedValue: Schema.NullOr(Schema.String),
    key: Schema.String,
}) {}

function completeSettings(): Settings {
    return Settings.make({
        blueskyAppPassword: 'bluesky-password',
        blueskyHandle: 'alice.example.com',
        feedCount: 250,
        libraryName: 'Alice’s library',
        mastodonAccessToken: 'mastodon-token',
        mastodonInstance: 'https://mastodon.social',
        twitterAccessSecret: 'twitter-access-secret',
        twitterAccessToken: 'twitter-access-token',
        twitterApiKey: 'twitter-key',
        twitterApiSecret: 'twitter-secret',
    });
}

it.layer(TestLayer)('encrypted settings repository', (it) => {
    it.effect('returns compatibility defaults when no settings exist', () =>
        Effect.gen(function* () {
            const settings = yield* SettingsRepository;
            const result = yield* settings.get;
            assert.strictEqual(result.feedCount, 50);
            assert.strictEqual(result.libraryName, DEFAULT_LIBRARY_NAME);
            assert.strictEqual(
                yield* settings.getLibraryName,
                DEFAULT_LIBRARY_NAME,
            );
            assert.strictEqual(result.twitterApiKey, '');
            assert.strictEqual(result.blueskyAppPassword, '');
        }),
    );

    it.effect('round-trips every setting without storing plaintext', () =>
        Effect.gen(function* () {
            const settings = yield* SettingsRepository;
            const d1Store = yield* D1Store;
            const expected = completeSettings();
            yield* settings.save(expected, 1_000);
            const loaded = yield* settings.get;
            assert.deepEqual(loaded, expected);

            const rows = yield* d1Store.query(
                StoredSetting,
                `
                    SELECT key, encrypted_value AS "encryptedValue"
                    FROM settings
                    ORDER BY key
                `,
            );
            assert.strictEqual(rows.rows.length, 10);
            assert.strictEqual(
                yield* settings.getLibraryName,
                expected.libraryName,
            );
            for (const row of rows.rows) {
                assert.isNotNull(row.encryptedValue);
                assert.isFalse(
                    completeSettings().twitterApiSecret === row.encryptedValue,
                );
                assert.include(row.encryptedValue ?? '', 'ciphertext');
            }
        }),
    );

    it.effect('stores cleared values as null and restores empty strings', () =>
        Effect.gen(function* () {
            const settings = yield* SettingsRepository;
            const d1Store = yield* D1Store;
            const empty = Settings.make({
                blueskyAppPassword: '',
                blueskyHandle: '',
                feedCount: 50,
                libraryName: DEFAULT_LIBRARY_NAME,
                mastodonAccessToken: '',
                mastodonInstance: '',
                twitterAccessSecret: '',
                twitterAccessToken: '',
                twitterApiKey: '',
                twitterApiSecret: '',
            });
            yield* settings.save(empty, 2_000);
            const loaded = yield* settings.get;
            assert.strictEqual(loaded.twitterApiSecret, '');
            const row = yield* d1Store.first(
                StoredSetting,
                `
                    SELECT key, encrypted_value AS "encryptedValue"
                    FROM settings
                    WHERE key = 'twitter_api_secret'
                `,
            );
            assert.isNull(row?.encryptedValue);
        }),
    );
});

it.effect(
    'decrypts previous key versions and rejects unavailable versions',
    () =>
        Effect.gen(function* () {
            const oldEncryption = makeEncryption(keyring);
            const encrypted = yield* oldEncryption.encrypt('rotation-value');
            const rotatedEncryption = makeEncryption(rotatedKeyring);
            assert.strictEqual(
                yield* rotatedEncryption.decrypt(encrypted),
                'rotation-value',
            );

            const missingKey = makeEncryption(
                '{"currentVersion":2,"keys":{"2":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}}',
            );
            const failure = yield* missingKey
                .decrypt(encrypted)
                .pipe(Effect.flip);
            assert.instanceOf(failure, EncryptionError);
            if (failure instanceof EncryptionError) {
                assert.strictEqual(failure.code, 'missing_key_version');
            }
        }),
);
