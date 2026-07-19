import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { Schema } from 'effect';

const execute = promisify(execFile);

function d1Arguments(command: string): string[] {
    const target =
        process.env.STAGING_BASE_URL === undefined
            ? ['gongyu-phase0-local', '--local']
            : ['DB', '--env', 'staging', '--remote'];
    return [
        'wrangler',
        'd1',
        'execute',
        ...target,
        '--json',
        `--command=${command}`,
    ];
}

const PublicKeyResponse = Schema.Struct({
    clientExtensionResults: Schema.Struct({}),
    id: Schema.String,
    rawId: Schema.String,
    type: Schema.Literal('public-key'),
});

const RegistrationVerificationRequest = Schema.Struct({
    ceremonyId: Schema.String,
    response: Schema.Struct({
        ...PublicKeyResponse.fields,
        response: Schema.Struct({
            attestationObject: Schema.String,
            clientDataJSON: Schema.String,
        }),
    }),
});

const AuthenticationVerificationRequest = Schema.Struct({
    ceremonyId: Schema.String,
    response: Schema.Struct({
        ...PublicKeyResponse.fields,
        response: Schema.Struct({
            authenticatorData: Schema.String,
            clientDataJSON: Schema.String,
            signature: Schema.String,
            userHandle: Schema.optionalKey(Schema.String),
        }),
    }),
});

const ClientData = Schema.Struct({
    challenge: Schema.String,
    crossOrigin: Schema.optionalKey(Schema.Boolean),
    origin: Schema.String,
    type: Schema.String,
});

const D1QueryResult = Schema.Array(
    Schema.Struct({
        results: Schema.Array(
            Schema.Struct({
                counter: Schema.Number,
                lastUsedAt: Schema.Number,
            }),
        ),
        success: Schema.Boolean,
    }),
);

const WorkflowPayload = Schema.Struct({
    operation: Schema.Literal('phase0.import'),
    source: Schema.Struct({
        bucket: Schema.Literal('uploads'),
        contentType: Schema.String,
        etag: Schema.String,
        key: Schema.String,
        size: Schema.Number,
    }),
    version: Schema.Literal(1),
});
const UploadResponse = Schema.Struct({
    workflowPayload: WorkflowPayload,
});
const WorkflowStartResponse = Schema.Struct({
    instanceId: Schema.String,
    status: Schema.Literal('queued'),
});
const HealthResponse = Schema.Struct({
    databaseReady: Schema.Boolean,
    environment: Schema.String,
    requestId: Schema.String,
    sessionConstraint: Schema.Literal('first-unconstrained'),
    status: Schema.Literal('ok'),
});

const WorkflowQueryResult = Schema.Array(
    Schema.Struct({
        results: Schema.Array(
            Schema.Struct({
                instanceId: Schema.String,
                objectKey: Schema.String,
                status: Schema.String,
            }),
        ),
        success: Schema.Boolean,
    }),
);

test('renders the SSR shell and persists hydrated theme changes', async ({
    page,
    request,
}) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-request-id']).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('<html lang="en" data-mode="light">');
    expect(html).toContain('Personal bookmarks');
    expect(html).toContain('No bookmarks have been saved yet.');

    const healthResponse = await request.get('/health');
    expect(healthResponse.status()).toBe(200);
    expect(healthResponse.headers()['cache-control']).toBe('no-store');
    const health = await Schema.decodeUnknownPromise(HealthResponse)(
        await healthResponse.json(),
    );
    expect(health.databaseReady).toBe(true);
    expect(health.requestId).toBe(healthResponse.headers()['x-request-id']);

    await page.goto(
        process.env.STAGING_BASE_URL === undefined
            ? '/'
            : `/?staging-smoke=${Date.now()}`,
    );
    await expect(
        page.getByRole('heading', { name: 'Gongyu', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(
        page.getByRole('link', { name: 'Skip to main content' }),
    ).toBeFocused();
    await page.evaluate(async () => {
        await fetch('/theme', {
            body: 'mode=dark&returnTo=%2F',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
        });
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await page.setViewportSize({ height: 800, width: 320 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
});

test('sets up one passkey, rotates sessions, and logs in', async ({
    context,
    page,
}) => {
    test.skip(
        process.env.STAGING_BASE_URL !== undefined,
        'Shared staging passkeys must not be modified by automation.',
    );
    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send(
        'WebAuthn.addVirtualAuthenticator',
        {
            options: {
                automaticPresenceSimulation: true,
                hasResidentKey: true,
                hasUserVerification: true,
                isUserVerified: true,
                protocol: 'ctap2',
                transport: 'internal',
            },
        },
    );

    await page.goto('/setup');
    await page
        .getByLabel('Bootstrap token')
        .fill('local-development-bootstrap-token');
    await page.route(
        '**/api/passkey/registration/verify',
        async (route) => {
            const payload: unknown = JSON.parse(
                route.request().postData() ?? 'null',
            );
            const request = await Schema.decodeUnknownPromise(
                RegistrationVerificationRequest,
            )(payload);
            const clientData = await Schema.decodeUnknownPromise(ClientData)(
                JSON.parse(
                    Buffer.from(
                        request.response.response.clientDataJSON,
                        'base64url',
                    ).toString('utf8'),
                ),
            );
            await route.continue({
                postData: JSON.stringify({
                    ...request,
                    response: {
                        ...request.response,
                        response: {
                            ...request.response.response,
                            clientDataJSON: Buffer.from(
                                JSON.stringify({
                                    ...clientData,
                                    origin: 'https://wrong-origin.test',
                                }),
                            ).toString('base64url'),
                        },
                    },
                }),
            });
        },
        { times: 1 },
    );
    await page
        .getByRole('button', { name: 'Register administrator passkey' })
        .click();
    await expect(
        page.getByText('Passkey registration could not be verified.'),
    ).toBeVisible();
    const { credentials } = await client.send('WebAuthn.getCredentials', {
        authenticatorId,
    });
    for (const credential of credentials) {
        await client.send('WebAuthn.removeCredential', {
            authenticatorId,
            credentialId: credential.credentialId,
        });
    }

    await page
        .getByRole('button', { name: 'Register administrator passkey' })
        .click();
    await expect(page).toHaveURL(/\/admin\/bookmarks$/u);
    await expect(
        page.getByRole('heading', { name: 'Bookmarks' }),
    ).toBeVisible();
    expect(
        (await context.cookies()).find(
            (cookie) => cookie.name === '__Host-gongyu-session',
        )?.httpOnly,
    ).toBe(true);
    expect(
        (await context.request.get('/admin/bookmarks')).headers()[
            'cache-control'
        ],
    ).toBe('private, no-store');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/u);

    await page.route(
        '**/api/passkey/authentication/verify',
        async (route) => {
            const payload: unknown = JSON.parse(
                route.request().postData() ?? 'null',
            );
            const request = await Schema.decodeUnknownPromise(
                AuthenticationVerificationRequest,
            )(payload);
            await route.continue({
                postData: JSON.stringify({
                    ...request,
                    response: {
                        ...request.response,
                        id: 'dW5rbm93bg',
                        rawId: 'dW5rbm93bg',
                    },
                }),
            });
        },
        { times: 1 },
    );
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(
        page.getByText('No matching passkey is registered.'),
    ).toBeVisible();

    const bookmarkletReturn =
        '/bookmarklet?url=https%3A%2F%2Fexample.com%2Fcaptured&title=Captured%20page&description=Selected%20text&source=bookmarklet';
    await page.goto(bookmarkletReturn);
    await expect(page).toHaveURL(/\/login\?returnTo=/u);
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page).toHaveURL(
        new RegExp(bookmarkletReturn.replaceAll('?', '\\?'), 'u'),
    );
    await expect(page.getByLabel('URL')).toHaveValue(
        'https://example.com/captured',
    );
    await expect(page.getByLabel('Title')).toHaveValue('Captured page');
    await expect(page.getByLabel('Description')).toHaveValue('Selected text');

    await page.goto('/admin/bookmarks');
    await page.getByRole('link', { name: 'New bookmark' }).click();
    await page.getByLabel('URL').fill('https://example.com/phase-two');
    await page.getByLabel('Title').fill('Phase Two Bookmark');
    await page.getByLabel('Description').fill('Searchable Cloudflare notes');
    await page.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(page).toHaveURL(/\/admin\/bookmarks$/u);
    await expect(page.getByText('Phase Two Bookmark')).toBeVisible();

    await page.goto('/?q=cloudflare');
    await expect(page.getByText('Phase Two Bookmark')).toBeVisible();
    await page.locator('a[href^="/b/"]').click();
    await expect(
        page.getByRole('heading', { name: 'Phase Two Bookmark' }),
    ).toBeVisible();

    await page.goto('/admin/bookmarks');
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('Updated Phase Two Bookmark');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Updated Phase Two Bookmark')).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await page
        .getByLabel('Type DELETE to permanently remove this bookmark')
        .fill('DELETE');
    await page.getByRole('button', { name: 'Delete bookmark' }).click();
    await expect(page.getByText('Updated Phase Two Bookmark')).toHaveCount(0);

    const popupPromise = context.waitForEvent('page');
    await page.evaluate((path) => {
        window.open(path, 'gongyu', 'width=600,height=500');
    }, bookmarkletReturn);
    const popup = await popupPromise;
    await popup.waitForURL(/\/bookmarklet\?/u);
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(popup.getByText('Saved successfully.')).toBeVisible();
    await popup.waitForEvent('close');

    const duplicatePopupPromise = context.waitForEvent('page');
    await page.evaluate((path) => {
        window.open(path, 'gongyu', 'width=600,height=500');
    }, bookmarkletReturn);
    const duplicatePopup = await duplicatePopupPromise;
    await expect(
        duplicatePopup.getByRole('heading', { name: 'Already bookmarked' }),
    ).toBeVisible();
    await duplicatePopup.waitForURL(/\/bookmarklet\?/u);
    await duplicatePopup.getByRole('button', { name: 'Close' }).click();

    await page.goto('/admin/dashboard?period=30d');
    await expect(
        page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Total bookmarks')).toBeVisible();

    await page.goto('/admin/settings');
    await page.getByLabel('Twitter API key').fill('browser-test-key');
    await page.getByLabel('Atom feed item count').fill('250');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page).toHaveURL(/\/admin\/settings\?saved=1$/u);
    await expect(page.getByLabel('Twitter API key')).toHaveValue(
        'browser-test-key',
    );
    await expect(page.getByLabel('Atom feed item count')).toHaveValue('250');

    const feedResponse = await context.request.get('/feed');
    expect(feedResponse.status()).toBe(200);
    expect(feedResponse.headers()['content-type']).toContain(
        'application/atom+xml',
    );
    expect(await feedResponse.text()).toContain('Captured page');

    const { stdout } = await execute(
        'bunx',
        d1Arguments('SELECT counter, last_used_at AS lastUsedAt FROM passkeys'),
    );
    const query = await Schema.decodeUnknownPromise(D1QueryResult)(
        JSON.parse(stdout),
    );
    expect(query[0]?.success).toBe(true);
    expect(query[0]?.results[0]?.counter).toBeGreaterThan(0);
    expect(query[0]?.results[0]?.lastUsedAt).toBeGreaterThan(0);

    const credentialsBeforeReplacement = (
        await client.send('WebAuthn.getCredentials', { authenticatorId })
    ).credentials;
    const oldCredentialId = credentialsBeforeReplacement[0]?.credentialId;
    expect(oldCredentialId).toBeTruthy();
    const sessionBeforeReplacement = (await context.cookies()).find(
        (cookie) => cookie.name === '__Host-gongyu-session',
    )?.value;
    await page.goto('/admin/security');
    await page.waitForFunction(
        () => document.querySelector('button')?.onclick !== null,
    );
    await page.getByRole('button', { name: 'Replace passkey' }).click();
    await expect
        .poll(
            async () =>
                (await context.cookies()).find(
                    (cookie) => cookie.name === '__Host-gongyu-session',
                )?.value,
        )
        .not.toBe(sessionBeforeReplacement);
    const credentialsAfterReplacement = (
        await client.send('WebAuthn.getCredentials', { authenticatorId })
    ).credentials;
    const replacement = credentialsAfterReplacement.find(
        (credential) => credential.credentialId !== oldCredentialId,
    );
    expect(replacement).toBeTruthy();

    await page.goto('/admin/bookmarks');
    await page.getByRole('button', { name: 'Sign out' }).click();
    if (replacement !== undefined) {
        await client.send('WebAuthn.removeCredential', {
            authenticatorId,
            credentialId: replacement.credentialId,
        });
    }
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page.getByText(/timed out or was not allowed/u)).toBeVisible();
});

test('serves public list, search, detail, and feed without JavaScript', async ({
    browser,
}) => {
    test.skip(
        process.env.STAGING_BASE_URL !== undefined,
        'Shared staging does not contain the local browser fixture.',
    );
    const context = await browser.newContext({
        baseURL: 'http://localhost:5173',
        javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto('/search?q=Captured');
    await expect(page.getByText('Captured page')).toBeVisible();
    const detailLink = page.locator('a[href^="/b/"]');
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(
        page.getByRole('heading', { name: 'Captured page' }),
    ).toBeVisible();
    const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href');
    expect(canonical).toMatch(/\/b\/[A-Za-z0-9]{8}$/u);
    expect(
        await page.locator('meta[property="og:url"]').getAttribute('content'),
    ).toBe(canonical);
    expect(await page.locator('meta[property="og:image"]').count()).toBe(0);

    const feed = await context.request.get('/feed');
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain('Captured page');
    await context.close();
});

test('streams an R2 upload into a version 1 Workflow', async ({ request }) => {
    const source = '{"bookmarks":[{"title":"Gongyu"}]}';
    const uploadResponse = await request.post('/api/phase0/uploads', {
        data: source,
        headers: { 'Content-Type': 'application/json' },
    });
    expect(uploadResponse.status()).toBe(201);
    const upload = await Schema.decodeUnknownPromise(UploadResponse)(
        await uploadResponse.json(),
    );
    expect(upload.workflowPayload.source.size).toBe(Buffer.byteLength(source));
    expect(upload.workflowPayload.source.key).toMatch(/^phase0\/uploads\//);

    const workflowResponse = await request.post('/api/phase0/workflows', {
        data: upload.workflowPayload,
    });
    expect(workflowResponse.status()).toBe(202);
    const workflow = await Schema.decodeUnknownPromise(WorkflowStartResponse)(
        await workflowResponse.json(),
    );

    await expect
        .poll(
            async () => {
                const { stdout } = await execute(
                    'bunx',
                    d1Arguments(
                        'SELECT instance_id AS instanceId, object_key AS objectKey, status FROM phase0_workflow_runs',
                    ),
                );
                const query = await Schema.decodeUnknownPromise(
                    WorkflowQueryResult,
                )(JSON.parse(stdout));
                return query[0]?.results.find(
                    (row) => row.instanceId === workflow.instanceId,
                );
            },
            { timeout: 20_000 },
        )
        .toEqual({
            instanceId: workflow.instanceId,
            objectKey: upload.workflowPayload.source.key,
            status: 'complete',
        });
});
