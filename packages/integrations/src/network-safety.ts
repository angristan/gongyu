const DNS_TIMEOUT_MS = 3_000;

type DnsJson = {
    readonly Answer?: ReadonlyArray<{
        readonly data?: unknown;
        readonly type?: unknown;
    }>;
    readonly Status?: unknown;
};

function publicIpv4(value: string): boolean {
    const parts = value.split('.').map(Number);
    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return false;
    }
    const [first = 0, second = 0, third = 0] = parts;
    return !(
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 0 && (third === 0 || third === 2)) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113) ||
        first >= 224
    );
}

function publicIpv6(value: string): boolean {
    const normalized = value.toLowerCase().split('%')[0] ?? '';
    if (!normalized.includes(':') || !/^[0-9a-f:.]+$/u.test(normalized)) {
        return false;
    }
    if (normalized.startsWith('::ffff:')) {
        return publicIpv4(normalized.slice('::ffff:'.length));
    }
    return !(
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/u.test(normalized) ||
        normalized.startsWith('ff') ||
        normalized.startsWith('2001:db8:')
    );
}

export function isPublicIpAddress(value: string): boolean {
    return value.includes(':') ? publicIpv6(value) : publicIpv4(value);
}

async function resolve(
    hostname: string,
    type: 'A' | 'AAAA',
    fetchImplementation: typeof fetch,
): Promise<ReadonlyArray<string>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
    try {
        const response = await fetchImplementation(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
            {
                headers: { Accept: 'application/dns-json' },
                signal: controller.signal,
            },
        );
        if (!response.ok) {
            throw new Error('DNS resolver request failed.');
        }
        const body = (await response.json()) as DnsJson;
        if (body.Status !== 0) {
            throw new Error('DNS resolution failed.');
        }
        const recordType = type === 'A' ? 1 : 28;
        return (body.Answer ?? []).flatMap((answer) =>
            answer.type === recordType && typeof answer.data === 'string'
                ? [answer.data]
                : [],
        );
    } finally {
        clearTimeout(timeout);
    }
}

export async function assertPublicHostname(
    url: URL,
    fetchImplementation: typeof fetch = fetch,
): Promise<void> {
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    if (
        hostname === '' ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        /^\d+(?:\.\d+){3}$/u.test(hostname) ||
        hostname.includes(':')
    ) {
        throw new Error('Outbound URL hostname is not public.');
    }
    const [ipv4, ipv6] = await Promise.all([
        resolve(hostname, 'A', fetchImplementation),
        resolve(hostname, 'AAAA', fetchImplementation),
    ]);
    const addresses = [...ipv4, ...ipv6];
    if (
        addresses.length === 0 ||
        addresses.some((value) => !isPublicIpAddress(value))
    ) {
        throw new Error('Outbound URL resolves to a non-public address.');
    }
}
