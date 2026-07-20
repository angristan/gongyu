import {
    isSafeShaarliUrl,
    shaarliApiFailure,
    shaarliAuthorization,
    shaarliLinksUrl,
} from '@gongyu/integrations/shaarli-api-client';
import { assert, it } from 'vitest';

function decodePart(value: string): unknown {
    const padded = value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
}

it('creates an HS512 bearer token with a deterministic issued-at time', async () => {
    const authorization = await shaarliAuthorization(
        'test-api-secret-key',
        () => 1_735_689_600_000,
    );
    assert.match(authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/u);
    const [header, payload] = authorization.slice('Bearer '.length).split('.');
    assert.deepEqual(decodePart(header ?? ''), { alg: 'HS512', typ: 'JWT' });
    assert.deepEqual(decodePart(payload ?? ''), { iat: 1_735_689_600 });
});

it('distinguishes authentication failures from upstream errors', () => {
    assert.deepEqual(shaarliApiFailure({ ok: false, status: 401 }), {
        message: 'Shaarli API authentication failed.',
        status: 400,
    });
    assert.deepEqual(shaarliApiFailure({ ok: false, status: 503 }), {
        message: 'Shaarli API returned 503.',
        status: 502,
    });
    assert.isNull(shaarliApiFailure({ ok: true, status: 200 }));
});

it('normalizes trailing slashes and requests every Shaarli link', () => {
    assert.strictEqual(
        shaarliLinksUrl(new URL('https://links.example.com/')).href,
        'https://links.example.com/api/v1/links?limit=all',
    );
    assert.strictEqual(
        shaarliLinksUrl(new URL('https://links.example.com/subdirectory/'))
            .href,
        'https://links.example.com/subdirectory/api/v1/links?limit=all',
    );
});

it('accepts only credential-free HTTPS hostnames and same-origin redirects', () => {
    assert.isTrue(isSafeShaarliUrl(new URL('https://links.example.com')));
    assert.isTrue(
        isSafeShaarliUrl(
            new URL('https://links.example.com/redirected'),
            'https://links.example.com',
        ),
    );
    for (const value of [
        'http://links.example.com',
        'https://person:secret@links.example.com',
        'https://localhost',
        'https://links.local',
        'https://127.0.0.1',
        'https://[::1]',
    ]) {
        assert.isFalse(isSafeShaarliUrl(new URL(value)), value);
    }
    assert.isFalse(
        isSafeShaarliUrl(
            new URL('https://other.example.com'),
            'https://links.example.com',
        ),
    );
});
