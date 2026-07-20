function base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/u, '');
}

export async function shaarliAuthorization(
    secret: string,
    now: () => number = Date.now,
): Promise<string> {
    const encoder = new TextEncoder();
    const header = base64Url(
        encoder.encode(JSON.stringify({ alg: 'HS512', typ: 'JWT' })),
    );
    const payload = base64Url(
        encoder.encode(JSON.stringify({ iat: Math.floor(now() / 1_000) })),
    );
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { hash: 'SHA-512', name: 'HMAC' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(`${header}.${payload}`),
    );
    return `Bearer ${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export interface ShaarliApiFailure {
    readonly message: string;
    readonly status: number;
}

export function shaarliApiFailure(
    response: Pick<Response, 'ok' | 'status'>,
): ShaarliApiFailure | null {
    if (response.status === 401) {
        return {
            message: 'Shaarli API authentication failed.',
            status: 400,
        };
    }
    if (!response.ok) {
        return {
            message: `Shaarli API returned ${response.status}.`,
            status: 502,
        };
    }
    return null;
}

export function isSafeShaarliUrl(url: URL, origin?: string): boolean {
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    return (
        url.protocol === 'https:' &&
        url.username === '' &&
        url.password === '' &&
        (origin === undefined || url.origin === origin) &&
        hostname !== 'localhost' &&
        !hostname.endsWith('.localhost') &&
        !hostname.endsWith('.local') &&
        !/^\d+(?:\.\d+){3}$/u.test(hostname) &&
        !hostname.includes(':')
    );
}

export function shaarliLinksUrl(baseUrl: URL): URL {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/u, '')}/api/v1/links`;
    url.search = '?limit=all';
    return url;
}
