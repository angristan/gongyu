import { purgePublicWorkerCache } from '@gongyu/integrations/workers-cache';
import { assert, it } from 'vitest';
import {
    applyResponseCachePolicy,
    shouldPurgePublicCache,
} from '../../workers/cache-policy';

it('caches the anonymous homepage at the edge and varies by cookie', () => {
    const headers = new Headers({ Vary: 'Accept-Encoding' });

    applyResponseCachePolicy({
        authenticated: false,
        headers,
        request: new Request('https://bookmarks.example/'),
        status: 200,
    });

    assert.strictEqual(
        headers.get('Cache-Control'),
        'public, max-age=0, must-revalidate',
    );
    assert.strictEqual(
        headers.get('Cloudflare-CDN-Cache-Control'),
        'public, max-age=86400',
    );
    assert.strictEqual(headers.get('Cache-Tag'), 'gongyu-public');
    assert.strictEqual(headers.get('Vary'), 'Accept-Encoding, Cookie');
});

it('caches the public feed without a session-specific variant', () => {
    const headers = new Headers({
        'Content-Type': 'application/atom+xml; charset=UTF-8',
    });

    applyResponseCachePolicy({
        authenticated: false,
        headers,
        request: new Request('https://bookmarks.example/feed'),
        status: 200,
    });

    assert.strictEqual(
        headers.get('Cloudflare-CDN-Cache-Control'),
        'public, max-age=86400',
    );
    assert.isNull(headers.get('Vary'));
});

it('keeps authenticated, cookie-clearing, and other responses private', () => {
    const authenticatedHeaders = new Headers();
    applyResponseCachePolicy({
        authenticated: true,
        headers: authenticatedHeaders,
        request: new Request('https://bookmarks.example/'),
        status: 200,
    });
    assert.strictEqual(
        authenticatedHeaders.get('Cache-Control'),
        'private, no-store',
    );

    const cookieHeaders = new Headers({ 'Set-Cookie': 'session=; Max-Age=0' });
    applyResponseCachePolicy({
        authenticated: false,
        headers: cookieHeaders,
        request: new Request('https://bookmarks.example/'),
        status: 200,
    });
    assert.strictEqual(cookieHeaders.get('Cache-Control'), 'private, no-store');

    const healthHeaders = new Headers({ 'Cache-Control': 'no-store' });
    applyResponseCachePolicy({
        authenticated: false,
        headers: healthHeaders,
        request: new Request('https://bookmarks.example/health'),
        status: 200,
    });
    assert.strictEqual(healthHeaders.get('Cache-Control'), 'no-store');
});

it('purges the shared public cache tag', async () => {
    const calls: CachePurgeOptions[] = [];
    const cacheContext: CacheContext = {
        async purge(options) {
            calls.push(options);
            return { errors: [], success: true };
        },
    };

    await purgePublicWorkerCache(cacheContext);

    assert.deepEqual(calls, [{ tags: ['gongyu-public'] }]);
});

it('purges only after successful authenticated mutations', () => {
    assert.isTrue(
        shouldPurgePublicCache({
            authenticated: true,
            method: 'POST',
            status: 302,
        }),
    );
    assert.isFalse(
        shouldPurgePublicCache({
            authenticated: false,
            method: 'POST',
            status: 302,
        }),
    );
    assert.isFalse(
        shouldPurgePublicCache({
            authenticated: true,
            method: 'GET',
            status: 200,
        }),
    );
    assert.isFalse(
        shouldPurgePublicCache({
            authenticated: true,
            method: 'POST',
            status: 409,
        }),
    );
});
