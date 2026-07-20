import { MetadataCandidate, MetadataError } from '@gongyu/domain/metadata';
import { Context, Effect } from 'effect';
import { assertPublicHostname } from './network-safety';

const HTML_LIMIT_BYTES = 1_048_576;
const FETCH_TIMEOUT_MS = 10_000;
const REDIRECT_LIMIT = 5;
const TITLE_SUFFIX_PATTERNS = [
    /\s*[|–—]\s*[^|–—]+$/u,
    /\s+-\s+[^-]+$/u,
    /\s*·\s*[^·]+$/u,
];
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/gu;
const KNOWN_TITLE_SUFFIX_PATTERNS = [
    'YouTube',
    'Wikipedia',
    'Reddit',
    'Twitter',
    'X',
    'GitHub',
    'Stack Overflow',
    'Medium',
    'The Verge',
    'Hacker News',
    'Ars Technica',
    'TechCrunch',
    'Wired',
    'BBC',
    'CNN',
    'The New York Times',
    'The Guardian',
    'The Washington Post',
    'Forbes',
    'Bloomberg',
].map(
    (suffix) =>
        new RegExp(
            `\\s*[|–—·:-]\\s*${suffix.replace(REGEXP_SPECIAL_CHARACTERS, '\\$&')}\\s*$`,
            'iu',
        ),
);

export type MetadataFetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>;

export interface MetadataClientShape {
    readonly fetch: (
        url: string,
    ) => Effect.Effect<MetadataCandidate, MetadataError>;
}

export class MetadataClient extends Context.Service<
    MetadataClient,
    MetadataClientShape
>()('@gongyu/integrations/MetadataClient') {}

function failure(
    code: string,
    message: string,
    retryable: boolean,
): MetadataError {
    return MetadataError.make({ code, message, retryable });
}

export function cleanMetadataTitle(title: string): string {
    const original = title.trim();
    if (original === '') {
        return original;
    }

    let cleaned = original;
    for (const pattern of TITLE_SUFFIX_PATTERNS) {
        cleaned = cleaned.replace(pattern, '');
    }
    for (const pattern of KNOWN_TITLE_SUFFIX_PATTERNS) {
        cleaned = cleaned.replace(pattern, '');
    }

    cleaned = cleaned.trim();
    return cleaned === '' ? original : cleaned;
}

function validateUrl(value: string): URL | MetadataError {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return failure('invalid_url', 'Enter a valid HTTPS URL.', false);
    }
    if (value.length > 2_048) {
        return failure('url_too_long', 'Metadata URL is too long.', false);
    }
    if (url.protocol !== 'https:') {
        return failure(
            'https_required',
            'Metadata requires an HTTPS URL.',
            false,
        );
    }
    if (url.username !== '' || url.password !== '') {
        return failure(
            'credentials_forbidden',
            'URLs containing credentials are not allowed.',
            false,
        );
    }
    return url;
}

const readBoundedText = Effect.fn('MetadataClient.readBoundedText')(function* (
    response: Response,
    deadline: number,
) {
    const declaredLength = Number.parseInt(
        response.headers.get('Content-Length') ?? '0',
        10,
    );
    if (declaredLength > HTML_LIMIT_BYTES) {
        return yield* failure(
            'response_too_large',
            'The metadata response is too large.',
            false,
        );
    }
    if (response.body === null) {
        return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';
    while (true) {
        const result = yield* Effect.tryPromise({
            try: async () => {
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    throw new Error('Metadata body timed out.');
                }
                let timeout: ReturnType<typeof setTimeout> | undefined;
                try {
                    return await Promise.race([
                        reader.read(),
                        new Promise<never>((_, reject) => {
                            timeout = setTimeout(() => {
                                void reader.cancel();
                                reject(new Error('Metadata body timed out.'));
                            }, remaining);
                        }),
                    ]);
                } finally {
                    if (timeout !== undefined) {
                        clearTimeout(timeout);
                    }
                }
            },
            catch: () =>
                failure(
                    'body_read_failed',
                    'The metadata response could not be read.',
                    true,
                ),
        });
        if (result.done) {
            text += decoder.decode();
            return text;
        }
        size += result.value.byteLength;
        if (size > HTML_LIMIT_BYTES) {
            yield* Effect.promise(() => reader.cancel());
            return yield* failure(
                'response_too_large',
                'The metadata response is too large.',
                false,
            );
        }
        text += decoder.decode(result.value, { stream: true });
    }
});

const extractMetadata = Effect.fn('MetadataClient.extract')(function* (
    html: string,
    finalUrl: URL,
) {
    let documentTitle = '';
    let openGraphTitle: string | null = null;
    let description: string | null = null;
    let openGraphDescription: string | null = null;
    let imageUrl: string | null = null;
    const rewriter = new HTMLRewriter()
        .on('title', {
            text(chunk) {
                documentTitle += chunk.text;
            },
        })
        .on('meta', {
            element(element) {
                const property = (
                    element.getAttribute('property') ??
                    element.getAttribute('name') ??
                    ''
                ).toLowerCase();
                const content = element.getAttribute('content')?.trim() ?? '';
                if (property === 'og:title' && content !== '') {
                    openGraphTitle = content;
                }
                if (property === 'og:description' && content !== '') {
                    openGraphDescription = content;
                }
                if (
                    description === null &&
                    property === 'description' &&
                    content !== ''
                ) {
                    description = content;
                }
                if (
                    imageUrl === null &&
                    (property === 'og:image' || property === 'twitter:image') &&
                    content !== ''
                ) {
                    try {
                        const resolved = new URL(content, finalUrl);
                        if (
                            resolved.protocol === 'https:' &&
                            resolved.username === '' &&
                            resolved.password === ''
                        ) {
                            imageUrl = resolved.href;
                        }
                    } catch {
                        imageUrl = null;
                    }
                }
            },
        });
    yield* Effect.tryPromise({
        try: () => rewriter.transform(new Response(html)).text(),
        catch: () =>
            failure(
                'html_parse_failed',
                'The metadata response could not be parsed.',
                false,
            ),
    });

    const normalizedTitle = cleanMetadataTitle(
        (openGraphTitle ?? documentTitle).replace(/\s+/gu, ' '),
    );
    const resolvedDescription = (openGraphDescription ?? description) as
        | string
        | null;
    const resolvedImageUrl = imageUrl as string | null;
    return MetadataCandidate.make({
        description: resolvedDescription?.slice(0, 4_096) ?? null,
        imageUrl:
            resolvedImageUrl !== null && resolvedImageUrl.length <= 2_048
                ? resolvedImageUrl
                : null,
        title: normalizedTitle === '' ? null : normalizedTitle.slice(0, 500),
    });
});

export function makeMetadataClient(
    configuredFetch?: MetadataFetch,
): MetadataClientShape {
    const fetchImplementation = configuredFetch ?? fetch;
    const validateDns = configuredFetch === undefined;
    const fetchMetadata = Effect.fn('MetadataClient.fetch')(function* (
        value: string,
    ) {
        const initialUrl = validateUrl(value);
        if (initialUrl instanceof MetadataError) {
            return yield* initialUrl;
        }
        let currentUrl = initialUrl;
        const deadline = Date.now() + 15_000;

        for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects += 1) {
            if (validateDns) {
                yield* Effect.tryPromise({
                    try: () => assertPublicHostname(currentUrl),
                    catch: () =>
                        failure(
                            'unsafe_hostname',
                            'Metadata hostname does not resolve publicly.',
                            false,
                        ),
                });
            }
            const response = yield* Effect.tryPromise({
                try: async (signal) => {
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) {
                        throw new Error('Metadata fetch timed out.');
                    }
                    const controller = new AbortController();
                    const timeout = setTimeout(
                        () => controller.abort(),
                        Math.min(FETCH_TIMEOUT_MS, remaining),
                    );
                    const abort = () => controller.abort();
                    signal.addEventListener('abort', abort, { once: true });
                    try {
                        return await fetchImplementation(currentUrl, {
                            headers: {
                                Accept: 'text/html,application/xhtml+xml',
                                'User-Agent': 'Gongyu metadata fetcher',
                            },
                            redirect: 'manual',
                            signal: controller.signal,
                        });
                    } finally {
                        clearTimeout(timeout);
                        signal.removeEventListener('abort', abort);
                    }
                },
                catch: () =>
                    failure(
                        'fetch_failed',
                        'Metadata could not be fetched.',
                        true,
                    ),
            });

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                if (redirects === REDIRECT_LIMIT) {
                    return yield* failure(
                        'redirect_limit',
                        'Metadata redirected too many times.',
                        false,
                    );
                }
                const location = response.headers.get('Location');
                if (location === null) {
                    return yield* failure(
                        'invalid_redirect',
                        'Metadata returned an invalid redirect.',
                        false,
                    );
                }
                const resolvedUrl = yield* Effect.try({
                    try: () => new URL(location, currentUrl),
                    catch: () =>
                        failure(
                            'invalid_redirect',
                            'Metadata returned an invalid redirect.',
                            false,
                        ),
                });
                const nextUrl = validateUrl(resolvedUrl.href);
                if (nextUrl instanceof MetadataError) {
                    return yield* failure(
                        'insecure_redirect',
                        'Metadata redirects must remain on HTTPS.',
                        false,
                    );
                }
                currentUrl = nextUrl;
                continue;
            }

            if (!response.ok) {
                return yield* failure(
                    'upstream_status',
                    'Metadata returned an unsuccessful response.',
                    response.status === 429 || response.status >= 500,
                );
            }
            const contentType = (response.headers.get('Content-Type') ?? '')
                .split(';')[0]
                .trim()
                .toLowerCase();
            if (
                contentType !== 'text/html' &&
                contentType !== 'application/xhtml+xml'
            ) {
                return yield* failure(
                    'unsupported_content_type',
                    'Metadata requires an HTML response.',
                    false,
                );
            }
            const html = yield* readBoundedText(response, deadline);
            return yield* extractMetadata(html, currentUrl);
        }

        return yield* failure(
            'redirect_limit',
            'Metadata redirected too many times.',
            false,
        );
    });

    return { fetch: fetchMetadata };
}
