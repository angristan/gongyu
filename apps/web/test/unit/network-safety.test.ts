import {
    assertPublicHostname,
    isPublicIpAddress,
} from '@gongyu/integrations/network-safety';
import { assert, expect, it } from 'vitest';

function dnsFetch(records: {
    readonly A: ReadonlyArray<string>;
    readonly AAAA: ReadonlyArray<string>;
}): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const type = url.searchParams.get('type') as 'A' | 'AAAA';
        return Response.json({
            Answer: records[type].map((data) => ({
                data,
                type: type === 'A' ? 1 : 28,
            })),
            Status: 0,
        });
    }) as typeof fetch;
}

it('accepts only hostnames whose complete DNS answer is public', async () => {
    await expect(
        assertPublicHostname(
            new URL('https://example.com/path'),
            dnsFetch({
                A: ['93.184.216.34'],
                AAAA: ['2606:2800:220:1:248:1893:25c8:1946'],
            }),
        ),
    ).resolves.toBeUndefined();
    await expect(
        assertPublicHostname(
            new URL('https://rebound.example'),
            dnsFetch({ A: ['93.184.216.34', '127.0.0.1'], AAAA: [] }),
        ),
    ).rejects.toThrow(/non-public/u);
    await expect(
        assertPublicHostname(
            new URL('https://unresolved.example'),
            dnsFetch({ A: [], AAAA: [] }),
        ),
    ).rejects.toThrow(/non-public/u);
});

it('rejects local, private, documentation, and mapped IP ranges', () => {
    for (const address of [
        '0.0.0.0',
        '10.0.0.1',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '192.168.0.1',
        '192.0.2.1',
        '198.51.100.1',
        '203.0.113.1',
        '::1',
        'fc00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
    ]) {
        assert.isFalse(isPublicIpAddress(address), address);
    }
    assert.isTrue(isPublicIpAddress('1.1.1.1'));
    assert.isTrue(isPublicIpAddress('2606:4700:4700::1111'));
});
