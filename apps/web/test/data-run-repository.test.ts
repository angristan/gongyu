import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import { D1Store, makeD1Store } from '@gongyu/data/d1-store';
import {
    DataRunBusyError,
    DataRunRepository,
    makeDataRunRepository,
    ReadOnlyError,
} from '@gongyu/data/data-run-repository';
import { PortableBookmark } from '@gongyu/domain/portability';
import { Effect, Layer, Schema } from 'effect';

const D1StoreTest = Layer.succeed(
    D1Store,
    makeD1Store(env.DB.withSession('first-primary')),
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
const TestLayer = Layer.merge(D1StoreTest, DataRunTest);

class ImportedRow extends Schema.Class<ImportedRow>('ImportedRow')({
    id: Schema.Number,
    shortUrl: Schema.String,
    url: Schema.String,
}) {}

class ErrorRow extends Schema.Class<ErrorRow>('ErrorRow')({
    code: Schema.String,
    rowIndex: Schema.Number,
}) {}

function row(input: {
    readonly id: number | null;
    readonly shortUrl: string | null;
    readonly url: string;
}): PortableBookmark {
    return PortableBookmark.make({
        createdAt: 1_000,
        description: null,
        id: input.id,
        shaarliShortUrl: null,
        shortUrl: input.shortUrl,
        thumbnailUrl: null,
        title: input.url,
        updatedAt: 2_000,
        url: input.url,
    });
}

it.layer(TestLayer)('data run repository', (it) => {
    it.effect(
        'commits valid rows errors counters and checkpoint atomically',
        () =>
            Effect.gen(function* () {
                const repository = yield* DataRunRepository;
                const d1 = yield* D1Store;
                yield* d1.run(
                    `
                    INSERT INTO bookmarks (
                        id, short_url, url, title, deletion_state,
                        created_at, updated_at
                    )
                    VALUES (5, 'Existing', 'https://example.com/existing', 'Existing', 'active', 1, 1)
                `,
                );
                yield* repository.createRun({
                    format: 'gongyu_json',
                    id: 'import-run',
                    kind: 'import',
                    mode: null,
                    now: 10,
                    sourceEtag: 'etag',
                    sourceKey: 'imports/import-run/source',
                    sourceSha256: 'digest',
                    sourceSize: 100,
                });
                yield* repository.startRun('import-run', 11);
                const busy = yield* repository
                    .createRun({
                        format: 'gongyu_json',
                        id: 'overlap',
                        kind: 'export',
                        mode: null,
                        now: 11,
                        sourceEtag: null,
                        sourceKey: null,
                        sourceSha256: null,
                        sourceSize: null,
                    })
                    .pipe(Effect.flip);
                assert.instanceOf(busy, DataRunBusyError);
                const outcome = yield* repository.importChunk({
                    errors: [
                        {
                            code: 'missing_url',
                            message: 'Missing URL',
                            rowIndex: 3,
                        },
                    ],
                    now: 12,
                    rows: [
                        row({
                            id: 5,
                            shortUrl: 'Conflict',
                            url: 'https://example.com/existing',
                        }),
                        row({
                            id: 42,
                            shortUrl: 'AbCd1234',
                            url: 'https://example.com/preserved',
                        }),
                        row({
                            id: 5,
                            shortUrl: null,
                            url: 'https://example.com/id-collision',
                        }),
                        row({
                            id: null,
                            shortUrl: null,
                            url: 'https://example.com/generated',
                        }),
                    ],
                    runId: 'import-run',
                    startIndex: 0,
                    totalRows: 5,
                });
                assert.strictEqual(outcome.importedRows, 2);
                assert.strictEqual(outcome.skippedRows, 1);
                assert.strictEqual(outcome.errorRows, 2);

                const imported = yield* d1.query(
                    ImportedRow,
                    `
                    SELECT id, short_url AS "shortUrl", url
                    FROM bookmarks
                    WHERE url LIKE 'https://example.com/%'
                    ORDER BY id
                `,
                );
                assert.lengthOf(imported.rows, 3);
                assert.strictEqual(
                    imported.rows.find(
                        (item) => item.url === 'https://example.com/preserved',
                    )?.id,
                    42,
                );
                assert.strictEqual(
                    imported.rows.find(
                        (item) => item.url === 'https://example.com/preserved',
                    )?.shortUrl,
                    'AbCd1234',
                );
                assert.match(
                    imported.rows.find(
                        (item) => item.url === 'https://example.com/generated',
                    )?.shortUrl ?? '',
                    /^[A-Za-z0-9]{8}$/u,
                );
                const errors = yield* d1.query(
                    ErrorRow,
                    `
                    SELECT row_index AS "rowIndex", code
                    FROM data_run_errors
                    WHERE run_id = ?
                    ORDER BY row_index
                `,
                    ['import-run'],
                );
                assert.deepEqual(
                    errors.rows.map((item) => item.code),
                    ['id_collision', 'missing_url'],
                );
                const run = yield* repository.getRun('import-run');
                assert.strictEqual(run?.checkpoint, 4);
                assert.strictEqual(run?.importedRows, 2);
                assert.strictEqual(run?.skippedRows, 1);
                assert.strictEqual(run?.errorRows, 2);

                const replay = yield* repository.importChunk({
                    errors: [],
                    now: 13,
                    rows: [
                        row({
                            id: 42,
                            shortUrl: 'AbCd1234',
                            url: 'https://example.com/preserved',
                        }),
                    ],
                    runId: 'import-run',
                    startIndex: 0,
                    totalRows: 5,
                });
                assert.strictEqual(replay.importedRows, 0);
            }),
    );

    it.effect('counts active writes and removes expired write leases', () =>
        Effect.gen(function* () {
            const repository = yield* DataRunRepository;
            const d1Store = yield* D1Store;
            yield* d1Store.batch([
                {
                    sql: 'INSERT INTO write_leases (id, expires_at) VALUES (?, ?)',
                    parameters: ['active', 100],
                },
                {
                    sql: 'INSERT INTO write_leases (id, expires_at) VALUES (?, ?)',
                    parameters: ['expired', 10],
                },
            ]);
            assert.strictEqual(yield* repository.countProcessingJobs(50), 1);
            const expired = yield* d1Store.first(
                class LeaseCount extends Schema.Class<LeaseCount>('LeaseCount')(
                    {
                        count: Schema.Number,
                    },
                ) {},
                `SELECT COUNT(*) AS count FROM write_leases WHERE id = 'expired'`,
            );
            assert.strictEqual(expired?.count, 0);
        }),
    );

    it.effect('enforces and releases maintenance read-only state', () =>
        Effect.gen(function* () {
            const repository = yield* DataRunRepository;
            const d1Store = yield* D1Store;
            yield* repository.assertWritable;
            yield* repository.setReadOnly(true, 'backup:test', 1);
            const failure = yield* repository.assertWritable.pipe(Effect.flip);
            assert.instanceOf(failure, ReadOnlyError);
            const blockedWrite = yield* d1Store
                .run(
                    `
                        INSERT INTO bookmarks (
                            short_url, url, title, deletion_state,
                            created_at, updated_at
                        ) VALUES ('Blocked1', 'https://example.com/blocked',
                            'Blocked', 'active', 1, 1)
                    `,
                )
                .pipe(Effect.flip);
            assert.include(blockedWrite.message, 'recovery_read_only');
            yield* repository.releaseReadOnly('restore:other', 2);
            const stillReadOnly = yield* repository.assertWritable.pipe(
                Effect.flip,
            );
            assert.instanceOf(stillReadOnly, ReadOnlyError);
            yield* repository.releaseReadOnly('backup:test', 3);
            yield* repository.assertWritable;
        }),
    );
});
