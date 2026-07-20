import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    BackupRepository,
    makeBackupRepository,
} from '@gongyu/data/backup-repository';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    DataRunRepository,
    makeDataRunRepository,
} from '@gongyu/data/data-run-repository';
import { BackupBookmark } from '@gongyu/domain/backup';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.succeed(
    D1Store,
    makeD1Store(env.DB.withSession('first-primary')),
);
const BackupTest = Layer.provide(
    Layer.effect(
        BackupRepository,
        Effect.gen(function* () {
            return makeBackupRepository(yield* D1Store);
        }),
    ),
    D1StoreTest,
);
const DataRunTest = Layer.provide(
    Layer.effect(
        DataRunRepository,
        Effect.gen(function* () {
            return makeDataRunRepository(yield* D1Store);
        }),
    ),
    D1StoreTest,
);
const TestLayer = Layer.mergeAll(D1StoreTest, BackupTest, DataRunTest);

class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.Number,
}) {}
class ValueRow extends Schema.Class<ValueRow>('ValueRow')({
    value: Schema.String,
}) {}

it.layer(TestLayer)('backup repository', (it) => {
    it.effect(
        'replaces canonical state and invalidates sessions atomically',
        () =>
            Effect.gen(function* () {
                const d1 = yield* D1Store;
                const backups = yield* BackupRepository;
                const runs = yield* DataRunRepository;
                yield* d1.batch([
                    {
                        sql: `
                        INSERT INTO bookmarks (
                            id, short_url, url, title, deletion_state,
                            created_at, updated_at
                        ) VALUES (77, 'Backup77', 'https://example.com/backup', 'Backup', 'active', 10, 11)
                    `,
                    },
                    {
                        sql: `INSERT INTO settings (key, encrypted_value, updated_at) VALUES ('feed_count', 'ciphertext', 12)`,
                    },
                    {
                        sql: `
                        INSERT INTO passkeys (
                            singleton_id, user_id, credential_id, public_key,
                            counter, transports_json, credential_device_type,
                            credential_backed_up, created_at
                        ) VALUES (1, '0f724f3b-b71e-4e67-8628-55b5327e3705', 'credential', ?, 3, '[]', 'singleDevice', 0, 13)
                    `,
                        parameters: [new Uint8Array([1, 2, 3])],
                    },
                    {
                        sql: `
                        INSERT INTO sessions (
                            token_hash, csrf_token_hash, created_at, last_seen_at,
                            idle_expires_at, absolute_expires_at
                        ) VALUES ('token', 'csrf', 1, 1, 999, 999)
                    `,
                    },
                ]);
                const snapshot = yield* backups.snapshot;
                assert.strictEqual(snapshot.bookmarks[0].id, 77);
                assert.strictEqual(snapshot.passkey?.publicKeyHex, '010203');

                yield* runs.createRun({
                    format: 'full_backup',
                    id: 'restore-replacement',
                    kind: 'restore',
                    mode: 'replacement',
                    now: 20,
                    sourceEtag: 'etag',
                    sourceKey: 'restores/source',
                    sourceSha256: 'sha',
                    sourceSize: 1,
                });
                yield* runs.startRun('restore-replacement', 20);
                yield* backups.stageBookmarks(
                    'restore-replacement',
                    0,
                    snapshot.bookmarks,
                );
                yield* backups.stageSettings(
                    'restore-replacement',
                    snapshot.settings,
                );
                yield* backups.stagePasskey(
                    'restore-replacement',
                    snapshot.passkey,
                );
                yield* d1.run('DELETE FROM bookmarks');
                yield* d1.run(
                    `
                    INSERT INTO bookmarks (
                        id, short_url, url, title, deletion_state,
                        created_at, updated_at
                    ) VALUES (88, 'Current8', 'https://example.com/current', 'Current', 'active', 30, 30)
                `,
                );
                yield* runs.setReadOnly(
                    true,
                    'restore:restore-replacement',
                    21,
                );
                yield* backups.cutover({
                    mode: 'replacement',
                    now: 22,
                    restorePasskey: true,
                    runId: 'restore-replacement',
                });
                yield* runs.completeRun({
                    artifactKey: null,
                    checksum: null,
                    expiresAt: null,
                    now: 22,
                    runId: 'restore-replacement',
                });

                const bookmark = yield* d1.first(
                    ValueRow,
                    `SELECT url AS value FROM bookmarks WHERE id = 77`,
                );
                assert.strictEqual(
                    bookmark?.value,
                    'https://example.com/backup',
                );
                assert.strictEqual(
                    (yield* d1.first(
                        CountRow,
                        'SELECT COUNT(*) AS count FROM bookmarks',
                    ))?.count,
                    1,
                );
                assert.strictEqual(
                    (yield* d1.first(
                        CountRow,
                        'SELECT COUNT(*) AS count FROM sessions',
                    ))?.count,
                    0,
                );
                yield* runs.assertWritable;
            }),
    );

    it.effect('finds destination objects orphaned by replacement', () =>
        Effect.gen(function* () {
            const d1 = yield* D1Store;
            const backups = yield* BackupRepository;
            yield* d1.run(
                `
                    INSERT INTO bookmarks (
                        id, short_url, url, title, thumbnail_key,
                        thumbnail_cleanup_key, deletion_state, created_at, updated_at
                    ) VALUES (90, 'Object90', 'https://example.com/object', 'Object', ?, ?, 'active', 1, 1)
                `,
                [
                    `thumbnails/Object90/${'a'.repeat(64)}.png`,
                    `thumbnails/Object90/${'b'.repeat(64)}.png`,
                ],
            );
            const candidates = yield* backups.listOwnedObjectKeys;
            assert.lengthOf(candidates, 2);
            yield* d1.run('DELETE FROM bookmarks');
            assert.deepEqual(
                [...(yield* backups.unownedObjectKeys(candidates))].sort(),
                [...candidates].sort(),
            );
        }),
    );

    it.effect(
        'merges exact new rows while keeping the destination passkey',
        () =>
            Effect.gen(function* () {
                const d1 = yield* D1Store;
                const backups = yield* BackupRepository;
                const runs = yield* DataRunRepository;
                yield* d1.run('DELETE FROM bookmarks');
                yield* d1.run(
                    `
                    INSERT INTO bookmarks (
                        id, short_url, url, title, deletion_state,
                        created_at, updated_at
                    ) VALUES (1, 'Current1', 'https://example.com/current', 'Current', 'active', 1, 1)
                `,
                );
                yield* runs.createRun({
                    format: 'full_backup',
                    id: 'restore-merge',
                    kind: 'restore',
                    mode: 'merge',
                    now: 1,
                    sourceEtag: 'etag',
                    sourceKey: 'restore/source',
                    sourceSha256: 'sha',
                    sourceSize: 1,
                });
                yield* runs.startRun('restore-merge', 1);
                const source = (yield* backups.snapshot).bookmarks[0];
                yield* backups.stageBookmarks('restore-merge', 0, [
                    source,
                    BackupBookmark.make({
                        ...source,
                        id: 2,
                        shortUrl: 'Imported',
                        title: 'Imported',
                        url: 'https://example.com/imported',
                    }),
                ]);
                yield* backups.stageSettings('restore-merge', []);
                yield* backups.stagePasskey('restore-merge', null);
                yield* runs.setReadOnly(true, 'restore:restore-merge', 2);
                yield* backups.cutover({
                    mode: 'merge',
                    now: 3,
                    restorePasskey: false,
                    runId: 'restore-merge',
                });
                yield* backups.cutover({
                    mode: 'merge',
                    now: 4,
                    restorePasskey: false,
                    runId: 'restore-merge',
                });
                assert.strictEqual(
                    (yield* d1.first(
                        CountRow,
                        'SELECT COUNT(*) AS count FROM bookmarks',
                    ))?.count,
                    2,
                );
                const run = yield* runs.getRun('restore-merge');
                assert.strictEqual(run?.totalRows, 2);
                assert.strictEqual(run?.importedRows, 1);
                assert.strictEqual(run?.skippedRows, 1);
                assert.strictEqual(run?.errorRows, 0);
                assert.strictEqual(run?.state, 'completed');
                assert.strictEqual(
                    (yield* d1.first(
                        CountRow,
                        "SELECT COUNT(*) AS count FROM audit_log WHERE event = 'data_restored' AND details_json LIKE '%restore-merge%'",
                    ))?.count,
                    1,
                );
            }),
    );
});
