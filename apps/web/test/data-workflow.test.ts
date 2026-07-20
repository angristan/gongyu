import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import type { DataWorkflowPayload } from '@gongyu/domain/portability';
import { makeEncryption } from '@gongyu/integrations/encryption';
import { Effect } from 'effect';

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        bytes.slice().buffer as ArrayBuffer,
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

async function waitForWorkflow(instance: WorkflowInstance): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const status = await instance.status();
        if (status.status === 'complete') {
            return;
        }
        if (status.status === 'errored' || status.status === 'terminated') {
            throw new Error(`Workflow ended in state ${status.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Workflow did not complete before the test deadline.');
}

it('imports exact portable rows then exports a private artifact', async () => {
    const importId = crypto.randomUUID();
    const sourceKey = `imports/${importId}/source`;
    const source = new TextEncoder().encode(
        JSON.stringify({
            bookmarks: [
                {
                    id: 9123,
                    url: 'https://workflow.example/imported',
                    title: 'Workflow imported',
                    description: 'Durable fixture',
                    short_url: 'Flow9123',
                    shaarli_short_url: 'flw123',
                    created_at: '2025-01-01T00:00:00.123456Z',
                    updated_at: '2025-01-02T00:00:00.654321Z',
                },
            ],
            count: 1,
            version: '1.0',
        }),
    );
    const object = await env.UPLOADS.put(sourceKey, source);
    if (object === null) {
        throw new Error('Test source upload failed.');
    }
    const checksum = await sha256(source);
    const now = Date.now() * 1_000;
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, mode, payload_version, state, source_key,
                source_etag, source_size, source_sha256, created_at, updated_at
            ) VALUES (?, 'import', 'gongyu_json', NULL, 1, 'pending', ?, ?, ?, ?, ?, ?)
        `,
    )
        .bind(
            importId,
            sourceKey,
            object.httpEtag,
            source.byteLength,
            checksum,
            now,
            now,
        )
        .run();
    const importPayload: DataWorkflowPayload = {
        format: 'gongyu_json',
        kind: 'import',
        mode: null,
        rpId: 'localhost',
        runId: importId,
        sourceEtag: object.httpEtag,
        sourceKey,
        sourceSha256: checksum,
        sourceSize: source.byteLength,
        version: 1,
    };
    const importInstance = await env.DATA_WORKFLOW.create({
        id: `import-v1-${importId}`,
        params: importPayload,
    });
    await waitForWorkflow(importInstance);

    const imported = await env.DB.prepare(
        `
            SELECT id, short_url, shaarli_short_url, created_at, updated_at
            FROM bookmarks WHERE url = ?
        `,
    )
        .bind('https://workflow.example/imported')
        .first<{
            created_at: number;
            id: number;
            shaarli_short_url: string;
            short_url: string;
            updated_at: number;
        }>();
    if (imported === null) {
        throw new Error('Workflow import did not create the fixture.');
    }
    assert.strictEqual(imported.id, 9123);
    assert.strictEqual(imported.short_url, 'Flow9123');
    assert.strictEqual(imported.shaarli_short_url, 'flw123');
    assert.strictEqual(imported.created_at % 1_000_000, 123_456);
    assert.strictEqual(imported.updated_at % 1_000_000, 654_321);
    assert.isNull(await env.UPLOADS.head(sourceKey));

    const exportId = crypto.randomUUID();
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, mode, payload_version, state, created_at, updated_at
            ) VALUES (?, 'export', 'gongyu_json', NULL, 1, 'pending', ?, ?)
        `,
    )
        .bind(exportId, now, now)
        .run();
    const exportPayload: DataWorkflowPayload = {
        format: 'gongyu_json',
        kind: 'export',
        mode: null,
        rpId: 'localhost',
        runId: exportId,
        sourceEtag: null,
        sourceKey: null,
        sourceSha256: null,
        sourceSize: null,
        version: 1,
    };
    const exportInstance = await env.DATA_WORKFLOW.create({
        id: `export-v1-${exportId}`,
        params: exportPayload,
    });
    await waitForWorkflow(exportInstance);
    const run = await env.DB.prepare(
        `SELECT artifact_key, checksum AS artifact_sha256, expires_at, state FROM data_runs WHERE id = ?`,
    )
        .bind(exportId)
        .first<{
            artifact_key: string;
            artifact_sha256: string;
            expires_at: number;
            state: string;
        }>();
    assert.strictEqual(run?.state, 'completed');
    assert.isAbove(run?.expires_at ?? 0, Date.now() * 1_000);
    const artifact =
        run?.artifact_key === undefined
            ? null
            : await env.UPLOADS.get(run.artifact_key);
    assert.isNotNull(artifact);
    const text = await artifact?.text();
    assert.include(text ?? '', 'https://workflow.example/imported');
    assert.strictEqual(
        await sha256(new TextEncoder().encode(text)),
        run?.artifact_sha256,
    );
}, 30_000);

it('creates and restores a self-contained full backup', async () => {
    const now = Date.now() * 1_000;
    const thumbnail = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const thumbnailChecksum = await sha256(thumbnail);
    const thumbnailKey = `thumbnails/Back9222/${thumbnailChecksum}.png`;
    await env.UPLOADS.put(thumbnailKey, thumbnail, {
        httpMetadata: { contentType: 'image/png' },
    });
    const encryption = makeEncryption(
        '{"currentVersion":1,"keys":{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}',
    );
    const sourceCiphertext = await Effect.runPromise(
        encryption.encrypt('restored-secret'),
    );
    await env.DB.prepare(
        `INSERT OR REPLACE INTO settings (key, encrypted_value, updated_at) VALUES ('twitter_api_key', ?, ?)`,
    )
        .bind(sourceCiphertext, now)
        .run();
    await env.DB.prepare(
        `
            INSERT INTO bookmarks (
                id, short_url, url, title, thumbnail_url, thumbnail_key,
                thumbnail_content_type, thumbnail_size, thumbnail_sha256,
                deletion_state, metadata_state, created_at, updated_at
            ) VALUES (9222, 'Back9222', 'https://workflow.example/backup',
                'Backup fixture', 'https://source.example/image.png', ?,
                'image/png', ?, ?, 'active', 'completed', ?, ?)
        `,
    )
        .bind(thumbnailKey, thumbnail.byteLength, thumbnailChecksum, now, now)
        .run();

    const backupId = crypto.randomUUID();
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, mode, payload_version, state, created_at, updated_at
            ) VALUES (?, 'backup', 'full_backup', NULL, 1, 'pending', ?, ?)
        `,
    )
        .bind(backupId, now, now)
        .run();
    const backupInstance = await env.DATA_WORKFLOW.create({
        id: `backup-v1-${backupId}`,
        params: {
            format: 'full_backup',
            kind: 'backup',
            mode: null,
            rpId: 'localhost',
            runId: backupId,
            sourceEtag: null,
            sourceKey: null,
            sourceSha256: null,
            sourceSize: null,
            version: 1,
        },
    });
    await waitForWorkflow(backupInstance);
    const backupRun = await env.DB.prepare(
        'SELECT artifact_key FROM data_runs WHERE id = ?',
    )
        .bind(backupId)
        .first<{ artifact_key: string }>();
    if (backupRun === null) {
        throw new Error('Backup artifact was not recorded.');
    }
    const backupObject = await env.UPLOADS.get(backupRun.artifact_key);
    if (backupObject === null) {
        throw new Error('Backup artifact was not written.');
    }
    const backupBytes = new Uint8Array(await backupObject.arrayBuffer());
    const decoded = JSON.parse(new TextDecoder().decode(backupBytes)) as {
        objects: Array<{ dataBase64: string; sourceKey: string }>;
    };
    assert.strictEqual(
        decoded.objects.find((item) => item.sourceKey === thumbnailKey)
            ?.dataBase64,
        'iVBORwECAwQ=',
    );

    await env.UPLOADS.delete(thumbnailKey);
    await env.DB.prepare('DELETE FROM bookmarks').run();
    const restoreId = crypto.randomUUID();
    const restoreKey = `restores/${restoreId}/source`;
    const restoreSource = await env.UPLOADS.put(restoreKey, backupBytes);
    if (restoreSource === null) {
        throw new Error('Restore source upload failed.');
    }
    const restoreChecksum = await sha256(backupBytes);
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, mode, payload_version, state, source_key,
                source_etag, source_size, source_sha256, created_at, updated_at
            ) VALUES (?, 'restore', 'full_backup', 'replacement', 1,
                'pending', ?, ?, ?, ?, ?, ?)
        `,
    )
        .bind(
            restoreId,
            restoreKey,
            restoreSource.httpEtag,
            backupBytes.byteLength,
            restoreChecksum,
            now,
            now,
        )
        .run();
    const restoreInstance = await env.DATA_WORKFLOW.create({
        id: `restore-v1-${restoreId}`,
        params: {
            format: 'full_backup',
            kind: 'restore',
            mode: 'replacement',
            rpId: 'localhost',
            runId: restoreId,
            sourceEtag: restoreSource.httpEtag,
            sourceKey: restoreKey,
            sourceSha256: restoreChecksum,
            sourceSize: backupBytes.byteLength,
            version: 1,
        },
    });
    await waitForWorkflow(restoreInstance);
    const restored = await env.DB.prepare(
        'SELECT thumbnail_key, metadata_state FROM bookmarks WHERE id = 9222',
    ).first<{ metadata_state: string; thumbnail_key: string }>();
    assert.strictEqual(restored?.thumbnail_key, thumbnailKey);
    assert.strictEqual(restored?.metadata_state, 'completed');
    assert.isNotNull(await env.UPLOADS.head(thumbnailKey));
    assert.isNull(await env.UPLOADS.head(restoreKey));
    const setting = await env.DB.prepare(
        "SELECT encrypted_value FROM settings WHERE key = 'twitter_api_key'",
    ).first<{ encrypted_value: string }>();
    assert.notStrictEqual(setting?.encrypted_value, sourceCiphertext);
    assert.strictEqual(
        await Effect.runPromise(
            encryption.decrypt(setting?.encrypted_value ?? ''),
        ),
        'restored-secret',
    );
    const state = await env.DB.prepare(
        'SELECT read_only FROM app_state WHERE singleton_id = 1',
    ).first<{ read_only: number }>();
    assert.strictEqual(state?.read_only, 0);
}, 30_000);
