import { expect, test } from 'vitest';
import migration from '../../../../migrations/0001_initial.sql?raw';

function hex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

test('keeps the production initial migration immutable', async () => {
    const checksum = hex(
        await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(migration),
        ),
    );
    expect(checksum).toBe(
        '98a36da6e5e09d934b913e4b77784f57afce64077c13c855d3ae2ba7f157bff8',
    );
});
