import { env } from 'cloudflare:workers';
import { assert, it } from '@effect/vitest';
import {
    type DataWorkflowPayload,
    microsToIso,
    timestampToMicros,
} from '@gongyu/domain/portability';

const BOOKMARK_COUNT = 6_264;
const SHAARLI_COUNT = 6_061;

async function sha256(bytes: Uint8Array): Promise<string> {
    const value = await crypto.subtle.digest(
        'SHA-256',
        bytes.buffer as ArrayBuffer,
    );
    return Array.from(new Uint8Array(value), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

async function waitForWorkflow(instance: WorkflowInstance): Promise<void> {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
        const status = await instance.status();
        if (status.status === 'complete') {
            return;
        }
        if (status.status === 'errored' || status.status === 'terminated') {
            throw new Error(`Workflow ended in state ${status.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Migration rehearsal Workflow timed out.');
}

it('round-trips the production-scale bookmark and Shaarli baseline', async () => {
    const bookmarks = Array.from({ length: BOOKMARK_COUNT }, (_, offset) => {
        const id = offset + 1;
        return {
            id,
            url: `https://migration.example/items/${id}?identity=${id}`,
            title: id === 1 ? 'Unicode 你好 & exact URL' : `Bookmark ${id}`,
            description: id % 7 === 0 ? `Description ${id}` : null,
            short_url: id.toString(36).padStart(8, '0'),
            shaarli_short_url:
                id <= SHAARLI_COUNT ? id.toString(36).padStart(6, '0') : null,
            thumbnail_url:
                id <= 46 ? `https://images.example/${id}.webp` : null,
            created_at: `2025-01-01T01:02:03.${String(id % 1_000_000).padStart(6, '0')}+01:00`,
            updated_at: `2025-02-01T00:00:00.${String((id * 17) % 1_000_000).padStart(6, '0')}Z`,
        };
    });
    const source = new TextEncoder().encode(
        JSON.stringify({ bookmarks, count: BOOKMARK_COUNT, version: '1.0' }),
    );
    assert.isBelow(source.byteLength, 10 * 1_024 * 1_024);
    const runId = crypto.randomUUID();
    const sourceKey = `imports/${runId}/source`;
    const object = await env.UPLOADS.put(sourceKey, source);
    if (object === null) {
        throw new Error('Migration source upload failed.');
    }
    const checksum = await sha256(source);
    const now = Date.now() * 1_000;
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, payload_version, state, source_key,
                source_etag, source_size, source_sha256, created_at, updated_at
            ) VALUES (?, 'import', 'gongyu_json', 1, 'pending', ?, ?, ?, ?, ?, ?)
        `,
    )
        .bind(
            runId,
            sourceKey,
            object.httpEtag,
            source.byteLength,
            checksum,
            now,
            now,
        )
        .run();
    const payload: DataWorkflowPayload = {
        format: 'gongyu_json',
        kind: 'import',
        mode: null,
        rpId: 'localhost',
        runId,
        sourceEtag: object.httpEtag,
        sourceKey,
        sourceSha256: checksum,
        sourceSize: source.byteLength,
        version: 1,
    };
    await waitForWorkflow(
        await env.DATA_WORKFLOW.create({
            id: `migration-import-v1-${runId}`,
            params: payload,
        }),
    );
    const imported = await env.DB.prepare(
        `
            SELECT
                COUNT(*) AS count,
                COUNT(shaarli_short_url) AS shaarli_count,
                COUNT(thumbnail_url) AS thumbnail_count
            FROM bookmarks
        `,
    ).first<{
        count: number;
        shaarli_count: number;
        thumbnail_count: number;
    }>();
    assert.strictEqual(imported?.count, BOOKMARK_COUNT);
    assert.strictEqual(imported?.shaarli_count, SHAARLI_COUNT);
    assert.strictEqual(imported?.thumbnail_count, 46);
    const identityChecks = await env.DB.prepare(
        `
            SELECT
                (SELECT COUNT(*) FROM bookmarks WHERE url = ?) AS exact_url_count,
                (SELECT COUNT(*) FROM bookmarks WHERE shaarli_short_url = '000001') AS shaarli_count,
                (SELECT COUNT(*) FROM bookmarks_fts WHERE bookmarks_fts MATCH '"Unicode"') AS search_count
        `,
    )
        .bind('https://migration.example/items/1?identity=1')
        .first<{
            exact_url_count: number;
            search_count: number;
            shaarli_count: number;
        }>();
    assert.deepEqual(identityChecks, {
        exact_url_count: 1,
        search_count: 1,
        shaarli_count: 1,
    });
    const importRun = await env.DB.prepare(
        'SELECT state, imported_rows, error_rows FROM data_runs WHERE id = ?',
    )
        .bind(runId)
        .first<{ error_rows: number; imported_rows: number; state: string }>();
    assert.deepEqual(importRun, {
        error_rows: 0,
        imported_rows: BOOKMARK_COUNT,
        state: 'completed',
    });

    const exportId = crypto.randomUUID();
    await env.DB.prepare(
        `
            INSERT INTO data_runs (
                id, kind, format, payload_version, state, created_at, updated_at
            ) VALUES (?, 'export', 'gongyu_json', 1, 'pending', ?, ?)
        `,
    )
        .bind(exportId, now, now)
        .run();
    await waitForWorkflow(
        await env.DATA_WORKFLOW.create({
            id: `migration-export-v1-${exportId}`,
            params: {
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
            },
        }),
    );
    const exportRun = await env.DB.prepare(
        'SELECT artifact_key FROM data_runs WHERE id = ?',
    )
        .bind(exportId)
        .first<{ artifact_key: string }>();
    if (exportRun === null) {
        throw new Error('Migration export artifact was not recorded.');
    }
    const artifact = await env.UPLOADS.get(exportRun.artifact_key);
    if (artifact === null) {
        throw new Error('Migration export artifact was not written.');
    }
    const exported = (await artifact.json()) as {
        bookmarks: Array<Record<string, unknown>>;
        count: number;
        version: string;
    };
    assert.strictEqual(exported.version, '1.0');
    assert.strictEqual(exported.count, BOOKMARK_COUNT);
    const expectedBookmarks = [...bookmarks].reverse().map((bookmark) => ({
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        short_url: bookmark.short_url,
        shaarli_short_url: bookmark.shaarli_short_url,
        thumbnail_url: bookmark.thumbnail_url,
        created_at: microsToIso(timestampToMicros(bookmark.created_at, 0)),
        updated_at: microsToIso(timestampToMicros(bookmark.updated_at, 0)),
    }));
    assert.strictEqual(
        await sha256(
            new TextEncoder().encode(JSON.stringify(exported.bookmarks)),
        ),
        await sha256(
            new TextEncoder().encode(JSON.stringify(expectedBookmarks)),
        ),
    );
    assert.strictEqual(exported.bookmarks[0].id, BOOKMARK_COUNT);
    assert.strictEqual(
        exported.bookmarks[0].url,
        `https://migration.example/items/${BOOKMARK_COUNT}?identity=${BOOKMARK_COUNT}`,
    );
    const oldest = exported.bookmarks[BOOKMARK_COUNT - 1];
    assert.strictEqual(oldest.id, 1);
    assert.strictEqual(oldest.title, 'Unicode 你好 & exact URL');
    assert.strictEqual(oldest.created_at, '2025-01-01T00:02:03.000001+00:00');
}, 60_000);
