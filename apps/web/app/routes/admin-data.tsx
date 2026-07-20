import { Button } from '@cloudflare/kumo/components/button';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import {
    DataRunBusyError,
    DataRunRepository,
} from '@gongyu/data/data-run-repository';
import type { DataWorkflowPayload } from '@gongyu/domain/portability';
import { assertPublicHostname } from '@gongyu/integrations/network-safety';
import { R2Store } from '@gongyu/integrations/r2-store';
import { PageShell } from '@gongyu/ui/page-shell';
import { Effect } from 'effect';
import {
    Form,
    Link,
    redirect,
    useNavigation,
    useRouteLoaderData,
} from 'react-router';
import {
    requireAuthenticatedMutation,
    requireAuthentication,
} from '../auth/session.server';
import { cloudflareRequestContext } from '../platform-context';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/admin-data';

const SOURCE_LIMIT_BYTES = 10 * 1_024 * 1_024;
const BACKUP_LIMIT_BYTES = 16 * 1_024 * 1_024;

export function meta(): Route.MetaDescriptors {
    return [{ title: 'Data · Gongyu' }];
}

async function digest(bytes: Uint8Array): Promise<string> {
    const value = await crypto.subtle.digest(
        'SHA-256',
        bytes.buffer as ArrayBuffer,
    );
    return Array.from(new Uint8Array(value), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

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

async function shaarliJwt(secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const header = base64Url(
        encoder.encode(JSON.stringify({ alg: 'HS512', typ: 'JWT' })),
    );
    const payload = base64Url(
        encoder.encode(JSON.stringify({ iat: Math.floor(Date.now() / 1_000) })),
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
    return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function isSafeShaarliUrl(url: URL, origin?: string): boolean {
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

async function fetchShaarli(formData: FormData): Promise<Uint8Array> {
    const value = formData.get('shaarli_url');
    const secret = formData.get('api_secret');
    if (
        typeof value !== 'string' ||
        typeof secret !== 'string' ||
        secret.length < 12
    ) {
        throw new Response('Enter a Shaarli URL and API secret.', {
            status: 400,
        });
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Response('Enter a valid Shaarli URL.', { status: 400 });
    }
    if (!isSafeShaarliUrl(url)) {
        throw new Response(
            'Shaarli API imports require HTTPS without URL credentials.',
            { status: 400 },
        );
    }
    url.pathname = `${url.pathname.replace(/\/$/u, '')}/api/v1/links`;
    url.search = '?limit=all';
    const origin = url.origin;
    const authorization = `Bearer ${await shaarliJwt(secret)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response | null = null;
    try {
        for (let redirects = 0; redirects <= 5; redirects += 1) {
            try {
                await assertPublicHostname(url);
            } catch {
                throw new Response(
                    'Shaarli API host does not resolve publicly.',
                    { status: 400 },
                );
            }
            response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    Authorization: authorization,
                },
                redirect: 'manual',
                signal: controller.signal,
            });
            if (![301, 302, 303, 307, 308].includes(response.status)) {
                break;
            }
            if (redirects === 5) {
                throw new Response('Shaarli API redirected too many times.', {
                    status: 502,
                });
            }
            const location = response.headers.get('Location');
            const redirected =
                location === null ? null : new URL(location, url);
            if (redirected === null || !isSafeShaarliUrl(redirected, origin)) {
                throw new Response('Shaarli API returned an unsafe redirect.', {
                    status: 502,
                });
            }
            url = redirected;
        }
    } catch (error) {
        if (error instanceof Response) {
            throw error;
        }
        throw new Response('Shaarli API request failed.', { status: 502 });
    } finally {
        clearTimeout(timeout);
    }
    if (response === null) {
        throw new Response('Shaarli API request failed.', { status: 502 });
    }
    if (response.status === 401) {
        throw new Response('Shaarli API authentication failed.', {
            status: 400,
        });
    }
    if (!response.ok) {
        throw new Response(`Shaarli API returned ${response.status}.`, {
            status: 502,
        });
    }
    const declared = Number.parseInt(
        response.headers.get('Content-Length') ?? '0',
        10,
    );
    if (declared > SOURCE_LIMIT_BYTES) {
        throw new Response('Shaarli API response is too large.', {
            status: 413,
        });
    }
    if (response.body === null) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const deadline = Date.now() + 60_000;
    let size = 0;
    while (true) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            await reader.cancel();
            throw new Response('Shaarli API response timed out.', {
                status: 504,
            });
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Response('Shaarli API response timed out.', {
                                status: 504,
                            }),
                        ),
                    remaining,
                );
            }),
        ]).finally(() => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        });
        if (result.done) {
            break;
        }
        size += result.value.byteLength;
        if (size > SOURCE_LIMIT_BYTES) {
            await reader.cancel();
            throw new Response('Shaarli API response is too large.', {
                status: 413,
            });
        }
        chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function sourceBytes(
    formData: FormData,
    intent: string,
): Promise<Uint8Array | null> {
    if (intent === 'import_api') {
        return fetchShaarli(formData);
    }
    if (intent !== 'import' && intent !== 'restore') {
        return null;
    }
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
        throw new Response('Choose a source file.', { status: 400 });
    }
    const maximum =
        intent === 'restore' ? BACKUP_LIMIT_BYTES : SOURCE_LIMIT_BYTES;
    if (file.size > maximum) {
        throw new Response(
            intent === 'restore'
                ? 'Backup files may not exceed 16 MiB.'
                : 'Source files may not exceed 10 MiB.',
            { status: 413 },
        );
    }
    return new Uint8Array(await file.arrayBuffer());
}

export async function loader({ context, request }: Route.LoaderArgs) {
    const { authentication, effect } = context.get(cloudflareRequestContext);
    if (!authentication.authenticated) {
        const url = new URL(request.url);
        return redirect(`/login?returnTo=${encodeURIComponent(url.pathname)}`);
    }
    const runs = await effect.runPromise(
        Effect.gen(function* () {
            const repository = yield* DataRunRepository;
            const runs = yield* repository.listRuns(50);
            return yield* Effect.forEach(runs, (run) =>
                repository
                    .listErrors(run.id, 20)
                    .pipe(Effect.map((errors) => ({ errors, run }))),
            );
        }),
    );
    return { now: Date.now() * 1_000, operations: runs };
}

export async function action({ context, request }: Route.ActionArgs) {
    const { authentication, effect, env } = context.get(
        cloudflareRequestContext,
    );
    requireAuthentication(authentication);
    if (request.headers.get('Origin') !== env.RP_ORIGIN) {
        throw new Response('Request origin is not allowed', { status: 403 });
    }
    const formData = await request.formData();
    const submittedCsrfToken = formData.get('_csrf');
    await requireAuthenticatedMutation({
        authentication,
        expectedOrigin: env.RP_ORIGIN,
        request,
        requireWritable: true,
        runner: effect,
        submittedCsrfToken:
            typeof submittedCsrfToken === 'string' ? submittedCsrfToken : null,
    });
    const intentValue = formData.get('intent');
    const intent = typeof intentValue === 'string' ? intentValue : '';
    if (
        ![
            'backup',
            'export',
            'import',
            'import_api',
            'restore',
            'retry',
        ].includes(intent)
    ) {
        throw new Response('Unsupported data operation.', { status: 400 });
    }
    if (intent === 'retry') {
        const runIdValue = formData.get('run_id');
        if (typeof runIdValue !== 'string') {
            throw new Response('Data operation is missing.', { status: 400 });
        }
        const run = await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* DataRunRepository;
                return yield* repository.getRun(runIdValue);
            }),
        );
        if (run === null || run.state !== 'pending') {
            throw new Response('Only pending data operations can be started.', {
                status: 409,
            });
        }
        await startDataWorkflow(env.DATA_WORKFLOW, {
            format: run.format as DataWorkflowPayload['format'],
            kind: run.kind as DataWorkflowPayload['kind'],
            mode: run.mode as DataWorkflowPayload['mode'],
            rpId: env.RP_ID,
            runId: run.id,
            sourceEtag: run.sourceEtag,
            sourceKey: run.sourceKey,
            sourceSha256: run.sourceSha256,
            sourceSize: run.sourceSize,
            version: 1,
        });
        return redirect('/admin/data');
    }
    const kind =
        intent === 'backup'
            ? 'backup'
            : intent === 'restore'
              ? 'restore'
              : intent === 'export'
                ? 'export'
                : 'import';
    const formatValue = formData.get('format');
    const format =
        kind === 'backup' || kind === 'restore'
            ? 'full_backup'
            : typeof formatValue === 'string'
              ? formatValue
              : null;
    const allowedFormats =
        kind === 'import'
            ? [
                  'gongyu_json',
                  'netscape_html',
                  'shaarli_api',
                  'shaarli_datastore',
              ]
            : kind === 'export'
              ? ['gongyu_json', 'netscape_html']
              : ['full_backup'];
    if (format === null || !allowedFormats.includes(format)) {
        throw new Response('Unsupported data format.', { status: 400 });
    }
    const modeValue = formData.get('mode');
    const mode =
        kind === 'restore' &&
        (modeValue === 'merge' || modeValue === 'replacement')
            ? modeValue
            : null;
    if (
        mode === 'replacement' &&
        formData.get('confirmation') !== 'REPLACE ALL DATA'
    ) {
        throw new Response('Type REPLACE ALL DATA to confirm replacement.', {
            status: 400,
        });
    }
    const bytes = await sourceBytes(formData, intent);
    const runId = crypto.randomUUID();
    const sourceKey =
        bytes === null
            ? null
            : `${kind === 'restore' ? 'restores' : 'imports'}/${runId}/source`;
    let sourceReference: {
        etag: string;
        sha256: string;
        size: number;
    } | null = null;
    if (bytes !== null && sourceKey !== null) {
        const checksum = await digest(bytes);
        sourceReference = await effect.runPromise(
            Effect.gen(function* () {
                const r2 = yield* R2Store;
                const body = new Response(bytes.buffer as ArrayBuffer).body;
                if (body === null) {
                    return yield* Effect.die(
                        new Error('Source is unreadable.'),
                    );
                }
                const object = yield* r2.putStream({
                    body,
                    contentLength: bytes.byteLength,
                    contentType: 'application/octet-stream',
                    key: sourceKey,
                });
                return {
                    etag: object.etag,
                    sha256: checksum,
                    size: object.size,
                };
            }),
        );
    }
    const now = Date.now() * 1_000;
    try {
        await effect.runPromise(
            Effect.gen(function* () {
                const repository = yield* DataRunRepository;
                yield* repository.createRun({
                    format,
                    id: runId,
                    kind,
                    mode,
                    now,
                    sourceEtag: sourceReference?.etag ?? null,
                    sourceKey,
                    sourceSha256: sourceReference?.sha256 ?? null,
                    sourceSize: sourceReference?.size ?? null,
                });
            }),
        );
    } catch (error) {
        if (sourceKey !== null) {
            await effect.runPromise(
                Effect.gen(function* () {
                    const r2 = yield* R2Store;
                    yield* r2.delete(sourceKey);
                }).pipe(Effect.ignore),
            );
        }
        if (error instanceof DataRunBusyError) {
            throw new Response('Another data operation is already running.', {
                status: 409,
            });
        }
        throw error;
    }
    const payload: DataWorkflowPayload = {
        format: format as DataWorkflowPayload['format'],
        kind: kind as DataWorkflowPayload['kind'],
        mode,
        rpId: env.RP_ID,
        runId,
        sourceEtag: sourceReference?.etag ?? null,
        sourceKey,
        sourceSha256: sourceReference?.sha256 ?? null,
        sourceSize: sourceReference?.size ?? null,
        version: 1,
    };
    await startDataWorkflow(env.DATA_WORKFLOW, payload);
    return redirect('/admin/data');
}

async function startDataWorkflow(
    workflow: Env['DATA_WORKFLOW'],
    payload: DataWorkflowPayload,
): Promise<void> {
    const instanceId = `${payload.kind}-v1-${payload.runId}`;
    try {
        await workflow.create({
            id: instanceId,
            params: payload,
            retention: {
                errorRetention: '7 days',
                successRetention: '1 day',
            },
        });
    } catch (creationError) {
        try {
            const status = await (await workflow.get(instanceId)).status();
            if (status.status !== 'errored' && status.status !== 'terminated') {
                return;
            }
        } catch {
            throw creationError;
        }
        throw creationError;
    }
}

function formatDate(value: number): string {
    return new Date(Math.floor(value / 1_000)).toLocaleString('en', {
        timeZone: 'UTC',
    });
}

export default function AdminData({ loaderData }: Route.ComponentProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>('root');
    const csrfToken = rootData?.csrfToken ?? '';
    const navigation = useNavigation();
    const isSubmitting = navigation.state !== 'idle';
    return (
        <PageShell
            description="Portable imports and exports plus full disaster backups and restores. Every operation runs durably in a Workflow."
            eyebrow="Administrator"
            footer={
                <Link className="text-kumo-link" to="/admin/dashboard">
                    Back to dashboard
                </Link>
            }
            title="Data portability"
        >
            {isSubmitting ? (
                <output className="mb-4 block text-sm font-medium text-kumo-default">
                    Submitting the data operation. Keep this page open…
                </output>
            ) : null}
            <div aria-busy={isSubmitting} className="grid gap-5 lg:grid-cols-2">
                <LayerCard>
                    <Form
                        className="space-y-4 p-6"
                        encType="multipart/form-data"
                        method="post"
                    >
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Import bookmarks
                        </h2>
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="intent" type="hidden" value="import" />
                        <label
                            className="block text-sm font-medium"
                            htmlFor="import-format"
                        >
                            Source format
                        </label>
                        <select
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            id="import-format"
                            name="format"
                        >
                            <option value="gongyu_json">
                                Gongyu JSON v1.0
                            </option>
                            <option value="netscape_html">
                                Netscape / Shaarli HTML
                            </option>
                            <option value="shaarli_datastore">
                                Shaarli datastore.php
                            </option>
                        </select>
                        <label
                            className="block text-sm font-medium"
                            htmlFor="import-file"
                        >
                            Source file (up to 10 MiB)
                        </label>
                        <input
                            className="block w-full"
                            id="import-file"
                            name="file"
                            required
                            type="file"
                        />
                        <Button disabled={isSubmitting} type="submit">
                            Start import
                        </Button>
                    </Form>
                </LayerCard>

                <LayerCard>
                    <Form className="space-y-4 p-6" method="post">
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Import Shaarli API
                        </h2>
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="intent" type="hidden" value="import_api" />
                        <input
                            name="format"
                            type="hidden"
                            value="shaarli_api"
                        />
                        <label
                            className="block text-sm font-medium"
                            htmlFor="shaarli-url"
                        >
                            Shaarli URL
                        </label>
                        <input
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            id="shaarli-url"
                            name="shaarli_url"
                            placeholder="https://links.example.com"
                            required
                            type="url"
                        />
                        <label
                            className="block text-sm font-medium"
                            htmlFor="shaarli-secret"
                        >
                            API secret
                        </label>
                        <input
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            id="shaarli-secret"
                            minLength={12}
                            name="api_secret"
                            placeholder="API secret"
                            required
                            type="password"
                        />
                        <Button disabled={isSubmitting} type="submit">
                            Fetch and import
                        </Button>
                    </Form>
                </LayerCard>

                <LayerCard>
                    <div className="space-y-4 p-6">
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Portable exports
                        </h2>
                        {[
                            ['gongyu_json', 'Gongyu JSON v1.0'],
                            ['netscape_html', 'Netscape HTML'],
                        ].map(([format, label]) => (
                            <Form key={format} method="post">
                                <input
                                    name="_csrf"
                                    type="hidden"
                                    value={csrfToken}
                                />
                                <input
                                    name="intent"
                                    type="hidden"
                                    value="export"
                                />
                                <input
                                    name="format"
                                    type="hidden"
                                    value={format}
                                />
                                <Button
                                    disabled={isSubmitting}
                                    type="submit"
                                    variant="secondary"
                                >
                                    Generate {label}
                                </Button>
                            </Form>
                        ))}
                    </div>
                </LayerCard>

                <LayerCard>
                    <div className="space-y-4 p-6">
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Full backup
                        </h2>
                        <p className="text-sm text-kumo-subtle">
                            Includes bookmarks, encrypted settings, the passkey,
                            stable configuration, and mirrored thumbnails.
                            Expires after 24 hours.
                        </p>
                        <Form method="post">
                            <input
                                name="_csrf"
                                type="hidden"
                                value={csrfToken}
                            />
                            <input name="intent" type="hidden" value="backup" />
                            <Button disabled={isSubmitting} type="submit">
                                Create full backup
                            </Button>
                        </Form>
                    </div>
                </LayerCard>

                <LayerCard className="lg:col-span-2">
                    <Form
                        className="space-y-4 p-6"
                        encType="multipart/form-data"
                        method="post"
                    >
                        <h2 className="text-lg font-semibold text-kumo-default">
                            Restore full backup
                        </h2>
                        <input name="_csrf" type="hidden" value={csrfToken} />
                        <input name="intent" type="hidden" value="restore" />
                        <label
                            className="block text-sm font-medium"
                            htmlFor="restore-file"
                        >
                            Full backup file (up to 16 MiB)
                        </label>
                        <input
                            className="block w-full"
                            id="restore-file"
                            name="file"
                            required
                            type="file"
                        />
                        <label
                            className="block text-sm font-medium"
                            htmlFor="restore-mode"
                        >
                            Restore mode
                        </label>
                        <select
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            id="restore-mode"
                            name="mode"
                        >
                            <option value="merge">Merge</option>
                            <option value="replacement">Replacement</option>
                        </select>
                        <label
                            className="block text-sm font-medium"
                            htmlFor="restore-confirmation"
                        >
                            Replacement confirmation
                        </label>
                        <input
                            className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2"
                            id="restore-confirmation"
                            name="confirmation"
                            placeholder="Type REPLACE ALL DATA for replacement"
                        />
                        <Button
                            disabled={isSubmitting}
                            type="submit"
                            variant="destructive"
                        >
                            Start restore
                        </Button>
                    </Form>
                </LayerCard>
            </div>

            <section className="mt-8 space-y-3" aria-labelledby="runs-heading">
                <h2
                    className="text-xl font-semibold text-kumo-default"
                    id="runs-heading"
                >
                    Recent operations
                </h2>
                {loaderData.operations.length === 0 ? (
                    <LayerCard>
                        <p className="p-6 text-kumo-subtle">
                            No portability operations yet.
                        </p>
                    </LayerCard>
                ) : (
                    loaderData.operations.map(({ errors, run }) => (
                        <LayerCard key={run.id}>
                            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                                <div>
                                    <p className="font-medium text-kumo-default">
                                        {run.kind} ·{' '}
                                        {run.format ?? run.mode ?? 'data'} ·{' '}
                                        {run.state}
                                    </p>
                                    <p className="text-sm text-kumo-subtle">
                                        {run.importedRows} imported ·{' '}
                                        {run.skippedRows} skipped ·{' '}
                                        {run.errorRows} errors ·{' '}
                                        {formatDate(run.createdAt)}
                                    </p>
                                </div>
                                {run.state === 'pending' ? (
                                    <Form method="post">
                                        <input
                                            name="_csrf"
                                            type="hidden"
                                            value={csrfToken}
                                        />
                                        <input
                                            name="intent"
                                            type="hidden"
                                            value="retry"
                                        />
                                        <input
                                            name="run_id"
                                            type="hidden"
                                            value={run.id}
                                        />
                                        <Button
                                            disabled={isSubmitting}
                                            type="submit"
                                            variant="secondary"
                                        >
                                            Start again
                                        </Button>
                                    </Form>
                                ) : null}
                                {run.state === 'completed' &&
                                run.artifactKey !== null &&
                                run.expiresAt !== null &&
                                run.expiresAt > loaderData.now ? (
                                    <Link
                                        className="text-kumo-link"
                                        to={`/admin/data/${run.id}/download`}
                                    >
                                        Download
                                    </Link>
                                ) : null}
                            </div>
                            {run.errorCode !== null ? (
                                <p className="border-t border-kumo-line px-5 py-3 text-sm text-kumo-danger">
                                    {run.errorCode}
                                </p>
                            ) : null}
                            {errors.length > 0 ? (
                                <ul className="border-t border-kumo-line px-5 py-3 text-sm text-kumo-subtle">
                                    {errors.map((error) => (
                                        <li
                                            key={`${error.rowIndex}:${error.code}`}
                                        >
                                            Row {error.rowIndex + 1}:{' '}
                                            {error.code} — {error.message}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </LayerCard>
                    ))
                )}
            </section>
        </PageShell>
    );
}
