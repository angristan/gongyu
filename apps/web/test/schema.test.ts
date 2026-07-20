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

it('creates the canonical schema from one clean migration', async () => {
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
        'a9b5ecd7cc609cbb2bd3df356ef7e4381de95e738112d22a502a3f1d27012070',
    );
    assert.isFalse(results.some(({ name }) => name.startsWith('phase0_')));

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
