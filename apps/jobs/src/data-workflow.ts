import {
    WorkflowEntrypoint,
    type WorkflowEvent,
    type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { BackupRepository } from '@gongyu/data/backup-repository';
import { DataRunRepository } from '@gongyu/data/data-run-repository';
import {
    type BackupBookmark,
    BackupObject,
    BackupSetting,
    FullBackupV1,
    fullBackupDataBytes,
} from '@gongyu/domain/backup';
import {
    DataWorkflowPayload,
    generateGongyuJson,
    generateNetscapeHtml,
    isSafeBookmarkUrl,
    type ParseResult,
    parseGongyuJson,
    parseNetscapeHtml,
    parseShaarliApiJson,
} from '@gongyu/domain/portability';
import {
    Encryption,
    encryptionKeyVersions,
} from '@gongyu/integrations/encryption';
import { R2Store } from '@gongyu/integrations/r2-store';
import { parseShaarliDatastore } from '@gongyu/integrations/shaarli-datastore';
import { Effect, Schema } from 'effect';
import { type JobsServices, makeJobsEffectRunner } from './runtime';

const SOURCE_LIMIT_BYTES = 10 * 1_024 * 1_024;
const BACKUP_LIMIT_BYTES = 16 * 1_024 * 1_024;
const CHUNK_SIZE = 100;
const DAY_MICROS = 24 * 60 * 60 * 1_000_000;
const stepOptions = {
    retries: { backoff: 'exponential', delay: '2 seconds', limit: 3 },
    timeout: '5 minutes',
} as const;
const drainStepOptions = {
    retries: { backoff: 'constant', delay: '5 seconds', limit: 30 },
    timeout: '3 minutes',
} as const;

function encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        bytes.buffer as ArrayBuffer,
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

const readBoundedObject = Effect.fn('DataWorkflow.readObject')(function* (
    key: string,
    maximum = SOURCE_LIMIT_BYTES,
) {
    const r2 = yield* R2Store;
    const object = yield* r2.get(key);
    if (object === null || object.size > maximum) {
        return yield* Effect.fail(
            new Error('R2 source is missing or too large.'),
        );
    }
    const bytes = new Uint8Array(
        yield* Effect.promise(() => new Response(object.body).arrayBuffer()),
    );
    if (bytes.byteLength > maximum) {
        return yield* Effect.fail(
            new Error('R2 source exceeds its byte limit.'),
        );
    }
    return { bytes, object };
});

const putImmutableBytes = Effect.fn('DataWorkflow.putObject')(
    function* (input: {
        readonly bytes: Uint8Array;
        readonly contentType: string;
        readonly customMetadata?: Readonly<Record<string, string>>;
        readonly key: string;
    }) {
        const r2 = yield* R2Store;
        const existing = yield* r2.get(input.key);
        if (existing !== null) {
            const existingBytes = new Uint8Array(
                yield* Effect.promise(() =>
                    new Response(existing.body).arrayBuffer(),
                ),
            );
            if (
                existing.size !== input.bytes.byteLength ||
                existing.contentType !== input.contentType ||
                (yield* Effect.promise(() => sha256(existingBytes))) !==
                    (yield* Effect.promise(() => sha256(input.bytes)))
            ) {
                return yield* Effect.fail(
                    new Error(
                        'Immutable workflow object content does not match.',
                    ),
                );
            }
            return existing;
        }
        const body = new Response(input.bytes.buffer as ArrayBuffer).body;
        if (body === null) {
            return yield* Effect.fail(
                new Error('Workflow object is unreadable.'),
            );
        }
        return yield* r2.putStream({
            body,
            contentLength: input.bytes.byteLength,
            contentType: input.contentType,
            customMetadata: input.customMetadata,
            key: input.key,
        });
    },
);

const parseSource = Effect.fn('DataWorkflow.parseSource')(function* (
    payload: DataWorkflowPayload,
    content: string,
    now: number,
) {
    if (payload.format === 'gongyu_json') {
        return yield* parseGongyuJson(content, now);
    }
    if (payload.format === 'netscape_html') {
        return parseNetscapeHtml(content, now);
    }
    if (payload.format === 'shaarli_api') {
        return yield* parseShaarliApiJson(content, now);
    }
    if (payload.format === 'shaarli_datastore') {
        return yield* parseShaarliDatastore(content, now);
    }
    return yield* Effect.fail(new Error('Unsupported import format.'));
});

const normalizeImport = Effect.fn('DataWorkflow.normalizeImport')(function* (
    payload: DataWorkflowPayload,
) {
    if (
        payload.sourceKey === null ||
        payload.sourceEtag === null ||
        payload.sourceSize === null ||
        payload.sourceSha256 === null
    ) {
        return yield* Effect.fail(new Error('Import source is incomplete.'));
    }
    const source = yield* readBoundedObject(payload.sourceKey);
    if (
        source.object.etag !== payload.sourceEtag ||
        source.object.size !== payload.sourceSize ||
        (yield* Effect.promise(() => sha256(source.bytes))) !==
            payload.sourceSha256
    ) {
        return yield* Effect.fail(
            new Error('Import source integrity check failed.'),
        );
    }
    const dataRuns = yield* DataRunRepository;
    const run = yield* dataRuns.getRun(payload.runId);
    if (run === null) {
        return yield* Effect.fail(new Error('Import run does not exist.'));
    }
    const parsed = yield* parseSource(
        payload,
        new TextDecoder().decode(source.bytes),
        run.createdAt,
    );
    const chunkCount = Math.max(
        parsed.errors.length > 0 ? 1 : 0,
        Math.ceil(parsed.bookmarks.length / CHUNK_SIZE),
    );
    const totalRows =
        parsed.bookmarks.length +
        parsed.errors.filter((item) => item.rowIndex >= 0).length;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = {
            errors: chunkIndex === 0 ? parsed.errors : [],
            rows: parsed.bookmarks.slice(start, start + CHUNK_SIZE),
            start,
            total: totalRows,
        };
        const bytes = new TextEncoder().encode(JSON.stringify(chunk));
        yield* putImmutableBytes({
            bytes,
            contentType: 'application/json',
            key: `imports/${payload.runId}/normalized/${String(chunkIndex).padStart(6, '0')}.json`,
        });
    }
    return { chunkCount, totalRows };
});

const importChunk = Effect.fn('DataWorkflow.importChunk')(function* (
    payload: DataWorkflowPayload,
    chunkIndex: number,
) {
    const source = yield* readBoundedObject(
        `imports/${payload.runId}/normalized/${String(chunkIndex).padStart(6, '0')}.json`,
        2 * 1_024 * 1_024,
    );
    const chunk = JSON.parse(new TextDecoder().decode(source.bytes)) as {
        errors: ParseResult['errors'];
        rows: ParseResult['bookmarks'];
        start: number;
        total: number;
    };
    const dataRuns = yield* DataRunRepository;
    return yield* dataRuns.importChunk({
        errors: chunk.errors,
        now: Date.now() * 1_000,
        rows: chunk.rows,
        runId: payload.runId,
        startIndex: chunk.start,
        totalRows: chunk.total,
    });
});

const exportBookmarks = Effect.fn('DataWorkflow.export')(function* (
    payload: DataWorkflowPayload,
) {
    const dataRuns = yield* DataRunRepository;
    const bookmarks = yield* dataRuns.listBookmarks;
    const run = yield* dataRuns.getRun(payload.runId);
    if (run === null) {
        return yield* Effect.fail(new Error('Export run does not exist.'));
    }
    const now = new Date(Math.floor(run.createdAt / 1_000));
    const content =
        payload.format === 'netscape_html'
            ? generateNetscapeHtml(bookmarks, now)
            : generateGongyuJson(bookmarks, now.toISOString());
    const extension = payload.format === 'netscape_html' ? 'html' : 'json';
    const contentType =
        payload.format === 'netscape_html'
            ? 'text/html; charset=utf-8'
            : 'application/json; charset=utf-8';
    const key = `exports/${payload.runId}/bookmarks.${extension}`;
    const bytes = new TextEncoder().encode(content);
    yield* putImmutableBytes({ bytes, contentType, key });
    return {
        checksum: yield* Effect.promise(() => sha256(bytes)),
        key,
    };
});

const createBackup = Effect.fn('DataWorkflow.backup')(function* (
    payload: DataWorkflowPayload,
    serializedKeyring: string,
) {
    const backups = yield* BackupRepository;
    const snapshot = yield* backups.snapshot;
    const dataRuns = yield* DataRunRepository;
    const run = yield* dataRuns.getRun(payload.runId);
    if (run === null) {
        return yield* Effect.fail(new Error('Backup run does not exist.'));
    }
    const r2 = yield* R2Store;
    const objects: BackupObject[] = [];
    const seen = new Set<string>();
    for (const bookmark of snapshot.bookmarks) {
        if (bookmark.thumbnailKey === null) {
            continue;
        }
        if (bookmark.thumbnailSha256 === null) {
            return yield* Effect.fail(
                new Error('Backup thumbnail metadata is incomplete.'),
            );
        }
        if (seen.has(bookmark.thumbnailKey)) {
            continue;
        }
        seen.add(bookmark.thumbnailKey);
        const object = yield* r2.get(bookmark.thumbnailKey);
        if (object === null || object.size > SOURCE_LIMIT_BYTES) {
            return yield* Effect.fail(
                new Error('Backup thumbnail is unavailable.'),
            );
        }
        const bytes = new Uint8Array(
            yield* Effect.promise(() =>
                new Response(object.body).arrayBuffer(),
            ),
        );
        const digest = yield* Effect.promise(() => sha256(bytes));
        if (digest !== bookmark.thumbnailSha256) {
            return yield* Effect.fail(
                new Error('Backup thumbnail checksum does not match.'),
            );
        }
        const contentType = object.contentType;
        if (
            contentType !== 'image/jpeg' &&
            contentType !== 'image/png' &&
            contentType !== 'image/webp'
        ) {
            return yield* Effect.fail(
                new Error('Backup thumbnail content type is unsupported.'),
            );
        }
        const backupKey = `backups/${payload.runId}/objects/${digest}`;
        objects.push(
            BackupObject.make({
                backupKey,
                contentType,
                dataBase64: encodeBase64(bytes),
                sha256: digest,
                size: bytes.byteLength,
                sourceKey: bookmark.thumbnailKey,
            }),
        );
    }
    const createdAt = new Date(Math.floor(run.createdAt / 1_000)).toISOString();
    const keyVersions = yield* encryptionKeyVersions(serializedKeyring);
    const dataSha256 = yield* Effect.promise(() =>
        sha256(
            fullBackupDataBytes({
                bookmarks: snapshot.bookmarks,
                createdAt,
                encryptionKeyVersions: keyVersions,
                objects,
                passkey: snapshot.passkey,
                rpId: payload.rpId,
                settings: snapshot.settings,
            }),
        ),
    );
    const backup = FullBackupV1.make({
        bookmarks: snapshot.bookmarks,
        createdAt,
        dataSha256,
        encryptionKeyVersions: keyVersions,
        format: 'gongyu-full-backup',
        objects,
        passkey: snapshot.passkey,
        rpId: payload.rpId,
        schemaVersion: 1,
        settings: snapshot.settings,
        timestampUnit: 'unix-microseconds',
    });
    const bytes = new TextEncoder().encode(JSON.stringify(backup));
    if (bytes.byteLength > BACKUP_LIMIT_BYTES) {
        return yield* Effect.fail(
            new Error('Full backup exceeds the 16 MiB portability limit.'),
        );
    }
    const key = `backups/${payload.runId}/gongyu-backup-v1.json`;
    yield* putImmutableBytes({
        bytes,
        contentType: 'application/json',
        key,
    });
    return {
        checksum: yield* Effect.promise(() => sha256(bytes)),
        key,
    };
});

const decodeBackup = Effect.fn('DataWorkflow.decodeBackup')(function* (
    payload: DataWorkflowPayload,
) {
    if (payload.sourceKey === null) {
        return yield* Effect.fail(new Error('Restore source is missing.'));
    }
    const source = yield* readBoundedObject(
        payload.sourceKey,
        BACKUP_LIMIT_BYTES,
    );
    if (
        payload.sourceEtag !== source.object.etag ||
        payload.sourceSize !== source.object.size ||
        payload.sourceSha256 !==
            (yield* Effect.promise(() => sha256(source.bytes)))
    ) {
        return yield* Effect.fail(
            new Error('Restore source integrity check failed.'),
        );
    }
    const unknownValue = yield* Effect.try({
        try: () => JSON.parse(new TextDecoder().decode(source.bytes)),
        catch: () => new Error('Restore source is invalid JSON.'),
    });
    const backup = yield* Schema.decodeUnknownEffect(FullBackupV1)(
        unknownValue,
    ).pipe(Effect.mapError(() => new Error('Restore manifest is invalid.')));
    const manifestChecksum = yield* Effect.promise(() =>
        sha256(fullBackupDataBytes(backup)),
    );
    if (manifestChecksum !== backup.dataSha256) {
        return yield* Effect.fail(
            new Error('Restore manifest checksum does not match.'),
        );
    }
    const objectsBySourceKey = new Map(
        backup.objects.map((entry) => [entry.sourceKey, entry]),
    );
    for (const bookmark of backup.bookmarks) {
        if (!isSafeBookmarkUrl(bookmark.url)) {
            return yield* Effect.fail(
                new Error('Restore bookmark URL is unsafe.'),
            );
        }
        if (bookmark.thumbnailKey !== null) {
            const expectedPrefix = `thumbnails/${bookmark.shortUrl}/${bookmark.thumbnailSha256 ?? ''}.`;
            const object = objectsBySourceKey.get(bookmark.thumbnailKey);
            if (
                bookmark.thumbnailSha256 === null ||
                bookmark.thumbnailContentType === null ||
                bookmark.thumbnailSize === null ||
                !bookmark.thumbnailKey.startsWith(expectedPrefix) ||
                object === undefined ||
                object.sha256 !== bookmark.thumbnailSha256 ||
                object.contentType !== bookmark.thumbnailContentType ||
                object.size !== bookmark.thumbnailSize
            ) {
                return yield* Effect.fail(
                    new Error('Restore thumbnail metadata is inconsistent.'),
                );
            }
        }
    }
    const passkey = backup.passkey;
    if (passkey !== null) {
        const transports = yield* Effect.try({
            try: () => JSON.parse(passkey.transportsJson) as unknown,
            catch: () => new Error('Restore passkey transports are invalid.'),
        });
        if (
            !Array.isArray(transports) ||
            transports.some((value) => typeof value !== 'string')
        ) {
            return yield* Effect.fail(
                new Error('Restore passkey transports are invalid.'),
            );
        }
    }
    return backup;
});

const stageRestore = Effect.fn('DataWorkflow.stageRestore')(function* (
    payload: DataWorkflowPayload,
    chunkIndex: number,
) {
    const source = yield* readBoundedObject(
        `restores/${payload.runId}/normalized/${String(chunkIndex).padStart(6, '0')}.json`,
    );
    const bookmarks = yield* Effect.try({
        try: () =>
            JSON.parse(
                new TextDecoder().decode(source.bytes),
            ) as ReadonlyArray<BackupBookmark>,
        catch: () => new Error('Normalized restore chunk is invalid.'),
    });
    const repository = yield* BackupRepository;
    yield* repository.stageBookmarks(
        payload.runId,
        chunkIndex * CHUNK_SIZE,
        bookmarks,
    );
});

const stageRestoreSettings = Effect.fn('DataWorkflow.stageSettings')(function* (
    payload: DataWorkflowPayload,
) {
    const backup = yield* decodeBackup(payload);
    const chunkCount = Math.ceil(backup.bookmarks.length / CHUNK_SIZE);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const bytes = new TextEncoder().encode(
            JSON.stringify(
                backup.bookmarks.slice(
                    chunkIndex * CHUNK_SIZE,
                    (chunkIndex + 1) * CHUNK_SIZE,
                ),
            ),
        );
        yield* putImmutableBytes({
            bytes,
            contentType: 'application/json',
            key: `restores/${payload.runId}/normalized/${String(chunkIndex).padStart(6, '0')}.json`,
        });
    }
    const encryption = yield* Encryption;
    const settings: BackupSetting[] = [];
    for (const setting of backup.settings) {
        settings.push(
            BackupSetting.make({
                encryptedValue:
                    setting.encryptedValue === null
                        ? null
                        : yield* encryption.encrypt(
                              yield* encryption.decrypt(setting.encryptedValue),
                          ),
                key: setting.key,
                updatedAt: setting.updatedAt,
            }),
        );
    }
    const repository = yield* BackupRepository;
    yield* repository.stageSettings(payload.runId, settings);
    yield* repository.stagePasskey(payload.runId, backup.passkey);
    return {
        bookmarkCount: backup.bookmarks.length,
        chunkCount,
        objectKeys: backup.objects.map((entry) => entry.sourceKey),
        restorePasskey:
            payload.mode === 'replacement' && backup.rpId === payload.rpId,
    };
});

const restoreObjects = Effect.fn('DataWorkflow.restoreObjects')(function* (
    payload: DataWorkflowPayload,
) {
    const backup = yield* decodeBackup(payload);
    const r2 = yield* R2Store;
    const createdKeys: string[] = [];
    for (const entry of backup.objects) {
        const bytes = yield* Effect.try({
            try: () => decodeBase64(entry.dataBase64),
            catch: () => new Error('Restore object encoding is invalid.'),
        });
        const digest = yield* Effect.promise(() => sha256(bytes));
        if (bytes.byteLength !== entry.size || digest !== entry.sha256) {
            return yield* Effect.fail(
                new Error('Restore object integrity check failed.'),
            );
        }
        const existing = yield* r2.get(entry.sourceKey);
        if (existing !== null) {
            if (existing.customMetadata.gongyuRestoreRun === payload.runId) {
                createdKeys.push(entry.sourceKey);
            }
            const existingBytes = new Uint8Array(
                yield* Effect.promise(() =>
                    new Response(existing.body).arrayBuffer(),
                ),
            );
            if (
                existingBytes.byteLength !== entry.size ||
                (yield* Effect.promise(() => sha256(existingBytes))) !==
                    entry.sha256
            ) {
                return yield* Effect.fail(
                    new Error('Restore object key has conflicting content.'),
                );
            }
            continue;
        }
        yield* putImmutableBytes({
            bytes,
            contentType: entry.contentType,
            customMetadata: { gongyuRestoreRun: payload.runId },
            key: entry.sourceKey,
        });
        createdKeys.push(entry.sourceKey);
    }
    return createdKeys;
});

export class DataWorkflow extends WorkflowEntrypoint<Env, DataWorkflowPayload> {
    async run(
        event: Readonly<WorkflowEvent<DataWorkflowPayload>>,
        step: WorkflowStep,
    ) {
        const decoded = await Schema.decodeUnknownPromise(DataWorkflowPayload)(
            event.payload,
        ).catch(() => null);
        if (decoded === null) {
            throw new NonRetryableError('Unsupported data Workflow payload.');
        }
        if (this.env.ENCRYPTION_KEYS === undefined) {
            await this.env.DB.prepare(
                `
                    UPDATE data_runs
                    SET state = 'failed',
                        error_code = 'ENCRYPTION_KEYS is not configured.',
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ? AND state IN ('pending', 'running')
                `,
            )
                .bind(Date.now() * 1_000, Date.now() * 1_000, decoded.runId)
                .run();
            if (decoded.sourceKey !== null) {
                await this.env.UPLOADS.delete(decoded.sourceKey);
            }
            throw new NonRetryableError('ENCRYPTION_KEYS is not configured.');
        }
        const serializedKeyring = this.env.ENCRYPTION_KEYS;
        const effect = makeJobsEffectRunner({
            database: this.env.DB,
            encryptionKeyring: serializedKeyring,
            invocationId: event.instanceId,
            objectStorage: this.env.UPLOADS,
            trigger: 'workflow',
        });
        const run = <A, E>(operation: Effect.Effect<A, E, JobsServices>) =>
            effect.runPromise(operation);
        let normalizedChunkCount = 0;
        let operationCompleted = false;
        let restoreChunkCount = 0;
        let restoreCandidateKeys: ReadonlyArray<string> = [];
        let restoreObjectKeys: ReadonlyArray<string> = [];
        let replacedObjectKeys: ReadonlyArray<string> = [];
        try {
            await step.do('start operation', stepOptions, () =>
                run(
                    Effect.gen(function* () {
                        const repository = yield* DataRunRepository;
                        yield* repository.startRun(
                            decoded.runId,
                            Date.now() * 1_000,
                        );
                    }),
                ),
            );
            if (decoded.kind === 'import') {
                const normalized = await step.do(
                    'normalize import source',
                    stepOptions,
                    () => run(normalizeImport(decoded)),
                );
                normalizedChunkCount = normalized.chunkCount;
                for (
                    let chunkIndex = 0;
                    chunkIndex < normalized.chunkCount;
                    chunkIndex += 1
                ) {
                    await step.do(
                        `commit import chunk ${String(chunkIndex).padStart(6, '0')}`,
                        stepOptions,
                        () => run(importChunk(decoded, chunkIndex)),
                    );
                }
                await step.do('complete import', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            yield* repository.completeRun({
                                artifactKey: null,
                                checksum: null,
                                expiresAt: null,
                                now: Date.now() * 1_000,
                                runId: decoded.runId,
                            });
                        }),
                    ),
                );
            } else if (decoded.kind === 'export') {
                const artifact = await step.do(
                    'generate export',
                    stepOptions,
                    () => run(exportBookmarks(decoded)),
                );
                await step.do('publish export', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            const now = Date.now() * 1_000;
                            yield* repository.completeRun({
                                artifactKey: artifact.key,
                                checksum: artifact.checksum,
                                expiresAt: now + DAY_MICROS,
                                now,
                                runId: decoded.runId,
                            });
                        }),
                    ),
                );
            } else if (decoded.kind === 'backup') {
                await step.do('enter backup read only', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            yield* repository.setReadOnly(
                                true,
                                `backup:${decoded.runId}`,
                                Date.now() * 1_000,
                            );
                        }),
                    ),
                );
                await step.do('drain backup jobs', drainStepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            if (
                                (yield* repository.countProcessingJobs(
                                    Date.now() * 1_000,
                                )) > 0
                            ) {
                                return yield* Effect.fail(
                                    new Error(
                                        'Background jobs are still processing.',
                                    ),
                                );
                            }
                        }),
                    ),
                );
                const artifact = await step.do(
                    'snapshot full backup',
                    stepOptions,
                    () => run(createBackup(decoded, serializedKeyring)),
                );
                await step.do('publish full backup', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            const now = Date.now() * 1_000;
                            yield* repository.releaseReadOnly(
                                `backup:${decoded.runId}`,
                                now,
                            );
                            yield* repository.completeRun({
                                artifactKey: artifact.key,
                                checksum: artifact.checksum,
                                expiresAt: now + DAY_MICROS,
                                now,
                                runId: decoded.runId,
                            });
                        }),
                    ),
                );
            } else {
                const preflight = await step.do(
                    'validate restore source',
                    stepOptions,
                    () => run(stageRestoreSettings(decoded)),
                );
                restoreChunkCount = preflight.chunkCount;
                restoreCandidateKeys = preflight.objectKeys;
                restoreObjectKeys = await step.do(
                    'restore object copies',
                    stepOptions,
                    () => run(restoreObjects(decoded)),
                );
                for (
                    let chunkIndex = 0;
                    chunkIndex < preflight.chunkCount;
                    chunkIndex += 1
                ) {
                    await step.do(
                        `stage restore chunk ${String(chunkIndex).padStart(6, '0')}`,
                        stepOptions,
                        () => run(stageRestore(decoded, chunkIndex)),
                    );
                }
                await step.do('enter restore read only', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            yield* repository.setReadOnly(
                                true,
                                `restore:${decoded.runId}`,
                                Date.now() * 1_000,
                            );
                        }),
                    ),
                );
                await step.do('drain restore jobs', drainStepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const repository = yield* DataRunRepository;
                            if (
                                (yield* repository.countProcessingJobs(
                                    Date.now() * 1_000,
                                )) > 0
                            ) {
                                return yield* Effect.fail(
                                    new Error(
                                        'Background jobs are still processing.',
                                    ),
                                );
                            }
                        }),
                    ),
                );
                if (decoded.mode === 'replacement') {
                    replacedObjectKeys = await step.do(
                        'capture replaced object keys',
                        stepOptions,
                        () =>
                            run(
                                Effect.gen(function* () {
                                    const backups = yield* BackupRepository;
                                    return yield* backups.listOwnedObjectKeys;
                                }),
                            ),
                    );
                }
                await step.do('cut over restored data', stepOptions, () =>
                    run(
                        Effect.gen(function* () {
                            const backups = yield* BackupRepository;
                            yield* backups.cutover({
                                mode: decoded.mode ?? 'merge',
                                now: Date.now() * 1_000,
                                restorePasskey: preflight.restorePasskey,
                                runId: decoded.runId,
                            });
                        }),
                    ),
                );
            }
            operationCompleted = true;
        } catch (cause) {
            await run(
                Effect.gen(function* () {
                    const repository = yield* DataRunRepository;
                    const now = Date.now() * 1_000;
                    if (
                        decoded.kind === 'backup' ||
                        decoded.kind === 'restore'
                    ) {
                        yield* repository.releaseReadOnly(
                            `${decoded.kind}:${decoded.runId}`,
                            now,
                        );
                    }
                    yield* repository.failRun(
                        decoded.runId,
                        cause instanceof Error
                            ? cause.message.slice(0, 500)
                            : 'workflow_failed',
                        now,
                    );
                }).pipe(Effect.ignore),
            );
            throw cause;
        } finally {
            await run(
                Effect.gen(function* () {
                    let cleanupObjectKeys: ReadonlyArray<string> = [];
                    if (decoded.kind === 'restore') {
                        const backups = yield* BackupRepository;
                        yield* backups.cleanupStage(decoded.runId);
                        const r2 = yield* R2Store;
                        const partiallyCreatedKeys: string[] = [];
                        for (const key of restoreCandidateKeys) {
                            const object = yield* r2.head(key);
                            if (
                                object?.customMetadata.gongyuRestoreRun ===
                                decoded.runId
                            ) {
                                partiallyCreatedKeys.push(key);
                            }
                        }
                        cleanupObjectKeys = yield* backups.unownedObjectKeys([
                            ...new Set([
                                ...restoreObjectKeys,
                                ...partiallyCreatedKeys,
                                ...replacedObjectKeys,
                            ]),
                        ]);
                    }
                    const r2 = yield* R2Store;
                    if (!operationCompleted && decoded.kind === 'export') {
                        yield* r2.delete(
                            `exports/${decoded.runId}/bookmarks.${decoded.format === 'netscape_html' ? 'html' : 'json'}`,
                        );
                    }
                    if (!operationCompleted && decoded.kind === 'backup') {
                        yield* r2.delete(
                            `backups/${decoded.runId}/gongyu-backup-v1.json`,
                        );
                    }
                    for (const key of cleanupObjectKeys) {
                        yield* r2.delete(key);
                    }
                    if (decoded.sourceKey !== null) {
                        yield* r2.delete(decoded.sourceKey);
                    }
                    for (let index = 0; index < restoreChunkCount; index += 1) {
                        yield* r2.delete(
                            `restores/${decoded.runId}/normalized/${String(index).padStart(6, '0')}.json`,
                        );
                    }
                    for (
                        let index = 0;
                        index < normalizedChunkCount;
                        index += 1
                    ) {
                        yield* r2.delete(
                            `imports/${decoded.runId}/normalized/${String(index).padStart(6, '0')}.json`,
                        );
                    }
                }).pipe(Effect.ignore),
            );
        }
        return { runId: decoded.runId, version: 1 };
    }
}
