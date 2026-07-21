import { env } from 'cloudflare:workers';
import { assert, it } from 'vitest';

interface SchemaRow {
    readonly name: string;
    readonly sql: string;
    readonly type: string;
}

function hex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

it('creates the canonical schema from sequential migrations', async () => {
    const { results } = await env.DB.prepare(
        `
            SELECT type, name, sql
            FROM sqlite_schema
            WHERE sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
              AND name NOT LIKE '_cf_%'
              AND name NOT LIKE 'd1_%'
              AND name NOT LIKE 'bookmarks_fts_%'
            ORDER BY type, name
        `,
    ).all<SchemaRow>();
    const manifest = results
        .map(
            ({ name, sql, type }) =>
                `${type}:${name}:${sql.replace(/\s+/gu, '')}`,
        )
        .join('\n');
    const fingerprint = hex(
        await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(manifest),
        ),
    );

    assert.strictEqual(
        fingerprint,
        'fa4090724b4b7d2096c23b3888477a99f0b36b396d519a023de68111bd3df042',
    );
    assert.isFalse(results.some(({ name }) => name.startsWith('phase0_')));
    assert.isTrue(results.some(({ name }) => name === 'preview_backfill_runs'));
    assert.isTrue(
        results.some(({ name }) => name === 'preview_backfill_items'),
    );

    const backfillRuns = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM preview_backfill_runs',
    ).first<{ readonly count: number }>();
    assert.strictEqual(backfillRuns?.count, 0);

    const appState = await env.DB.prepare(
        `
            SELECT
                singleton_id AS singletonId,
                read_only AS readOnly,
                reason,
                recovery_write AS recoveryWrite,
                updated_at AS updatedAt
            FROM app_state
            WHERE singleton_id = 1
        `,
    ).first<{
        readonly singletonId: number;
        readonly readOnly: number;
        readonly reason: string | null;
        readonly recoveryWrite: number;
        readonly updatedAt: number;
    }>();
    assert.deepEqual(appState, {
        readOnly: 0,
        reason: null,
        recoveryWrite: 0,
        singletonId: 1,
        updatedAt: 0,
    });
});
