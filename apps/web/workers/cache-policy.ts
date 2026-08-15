import { PUBLIC_CACHE_TAG } from '@gongyu/integrations/workers-cache';

const BROWSER_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const EDGE_CACHE_CONTROL = 'public, max-age=86400';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

function appendVary(headers: Headers, field: string): void {
    const fields = (headers.get('Vary') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '');
    if (!fields.some((value) => value.toLowerCase() === field.toLowerCase())) {
        fields.push(field);
    }
    if (fields.length > 0) {
        headers.set('Vary', fields.join(', '));
    }
}

export function applyResponseCachePolicy(input: {
    readonly authenticated: boolean;
    readonly headers: Headers;
    readonly request: Request;
    readonly status: number;
}): void {
    const { authenticated, headers, request, status } = input;
    const url = new URL(request.url);
    const cacheableMethod =
        request.method === 'GET' || request.method === 'HEAD';
    const cacheablePath = url.pathname === '/' || url.pathname === '/feed';
    const clearsCookies = headers.has('Set-Cookie');

    if (
        !authenticated &&
        cacheableMethod &&
        cacheablePath &&
        status === 200 &&
        !clearsCookies
    ) {
        headers.set('Cache-Control', BROWSER_CACHE_CONTROL);
        headers.set('Cloudflare-CDN-Cache-Control', EDGE_CACHE_CONTROL);
        headers.set('Cache-Tag', PUBLIC_CACHE_TAG);
        if (url.pathname === '/') {
            appendVary(headers, 'Cookie');
        }
        return;
    }

    if (!headers.has('Cache-Control')) {
        headers.set('Cache-Control', PRIVATE_CACHE_CONTROL);
    }
}

export function shouldPurgePublicCache(input: {
    readonly authenticated: boolean;
    readonly method: string;
    readonly status: number;
}): boolean {
    return (
        input.authenticated &&
        !['GET', 'HEAD', 'OPTIONS'].includes(input.method) &&
        input.status >= 200 &&
        input.status < 400
    );
}
