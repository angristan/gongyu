import { Schema } from 'effect';

export class BootstrapRequest extends Schema.Class<BootstrapRequest>(
    'BootstrapRequest',
)({
    bootstrapToken: Schema.String,
}) {}

export class RecoveryRequest extends Schema.Class<RecoveryRequest>(
    'RecoveryRequest',
)({
    bootstrapToken: Schema.String,
    confirmation: Schema.Literal('RESET GONGYU ADMINISTRATOR'),
}) {}

async function digest(value: string): Promise<Uint8Array> {
    return new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    );
}

export async function bootstrapTokenMatches(
    submitted: string,
    expected: string,
): Promise<boolean> {
    const [left, right] = await Promise.all([
        digest(submitted),
        digest(expected),
    ]);
    let difference = left.length ^ right.length;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
    }
    return difference === 0;
}

export function safeReturnTo(value: string | null): string {
    if (value === null || !value.startsWith('/') || value.startsWith('//')) {
        return '/admin/bookmarks';
    }
    try {
        const parsed = new URL(value, 'https://gongyu.invalid');
        return parsed.origin === 'https://gongyu.invalid'
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : '/admin/bookmarks';
    } catch {
        return '/admin/bookmarks';
    }
}
