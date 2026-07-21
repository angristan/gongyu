import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { Schema } from 'effect';

const execute = promisify(execFile);

function d1Arguments(command: string): string[] {
    return [
        'wrangler',
        'd1',
        'execute',
        'gongyu-local',
        '--local',
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

const HealthResponse = Schema.Struct({
    databaseReady: Schema.Boolean,
    environment: Schema.String,
    requestId: Schema.String,
    sessionConstraint: Schema.Literal('first-unconstrained'),
    status: Schema.Literal('ok'),
});

test('renders the SSR shell and persists hydrated theme changes', async ({
    page,
    request,
}) => {
    const pageErrors: string[] = [];
    const hydrationErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            /hydration|server rendered|did not match/iu.test(message.text())
        ) {
            hydrationErrors.push(message.text());
        }
    });

    const response = await request.get('/');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-request-id']).toBeTruthy();
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['referrer-policy']).toBe(
        'strict-origin-when-cross-origin',
    );
    const html = await response.text();
    expect(html).toContain('data-mantine-color-scheme="light"');
    expect(html).toContain('data-mode="light"');
    expect(html).toContain('Links worth returning to');
    expect(html).toContain('Personal library');
    expect(html).toContain('src="/images/logo.png"');
    expect(html).toContain('Search titles, notes, and URLs');
    expect(html).toContain('id="main-content"');

    const adminResponse = await request.get('/admin/bookmarks', {
        maxRedirects: 0,
    });
    expect(adminResponse.status()).toBe(302);
    expect(adminResponse.headers().location).toMatch(/^\/login/u);

    const healthResponse = await request.get('/health');
    expect(healthResponse.status()).toBe(200);
    expect(healthResponse.headers()['cache-control']).toBe('no-store');
    const health = await Schema.decodeUnknownPromise(HealthResponse)(
        await healthResponse.json(),
    );
    expect(health.databaseReady).toBe(true);
    expect(health.requestId).toBe(healthResponse.headers()['x-request-id']);

    await page.goto('/');
    await expect(
        page.getByRole('heading', {
            name: 'Links worth returning to',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('search', { name: 'Search bookmarks' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Search bookmarks' }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const logoTransitionDuration = await page
        .getByRole('link', { name: 'Gongyu home' })
        .locator('span')
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(logoTransitionDuration)).toBeLessThan(0.001);
    await page.keyboard.press('Tab');
    await expect(
        page.getByRole('link', { name: 'Skip to main content' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
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
    await expect(
        page.getByRole('search', { name: 'Search bookmarks' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'List view' })).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Gallery view' }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
});

test('sets up one passkey, rotates sessions, and logs in', async ({
    browser,
    context,
    page,
}) => {
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
        page.getByRole('heading', { exact: true, name: 'Bookmarks' }),
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
        '/bookmarklet?url=https%3A%2F%2Fexample.com%2Fcaptured&title=Captured%20page%20%7C%20Example%20Site&description=Selected%20text&source=bookmarklet';
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
    await page
        .locator('#main-content')
        .getByRole('link', { name: 'New bookmark' })
        .click();
    let releaseMetadataResponse = () => {};
    let reportMetadataRequest = () => {};
    const metadataResponseGate = new Promise<void>((resolve) => {
        releaseMetadataResponse = resolve;
    });
    const metadataRequestStarted = new Promise<void>((resolve) => {
        reportMetadataRequest = resolve;
    });
    await page.route('**/api/metadata/preview', async (route) => {
        reportMetadataRequest();
        await metadataResponseGate;
        await route.fulfill({
            body: JSON.stringify({
                description: 'Fetched description',
                title: 'Fetched title',
            }),
            contentType: 'application/json',
            status: 200,
        });
    });
    await page.getByLabel('URL').fill('https://example.com/metadata-race');
    const metadataRequest = page
        .getByRole('button', { name: 'Fetch metadata' })
        .click();
    await metadataRequestStarted;
    await page.getByLabel('Title').fill('Manual title');
    await page.getByLabel('Description').fill('Manual description');
    releaseMetadataResponse();
    await metadataRequest;
    await expect(
        page.getByText('Metadata candidates are ready.'),
    ).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Manual title');
    await expect(page.getByLabel('Description')).toHaveValue(
        'Manual description',
    );
    await page.unroute('**/api/metadata/preview');
    await page.getByLabel('URL').fill('https://example.com/phase-two');
    await page.getByLabel('Title').fill('Phase Two Bookmark');
    await page.getByLabel('Description').fill('Searchable Cloudflare notes');
    await page.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(page).toHaveURL(/\/admin\/bookmarks$/u);
    await expect(
        page
            .getByRole('link', { exact: true, name: 'Phase Two Bookmark' })
            .first(),
    ).toBeVisible();
    const sidebarWidth = await page
        .locator('aside[data-admin-sidebar]')
        .evaluate((element) => element.getBoundingClientRect().width);
    expect(sidebarWidth).toBeLessThanOrEqual(230);
    const bookmarkColumns = await page
        .locator('[data-bookmark-row]')
        .first()
        .evaluate((row) => {
            const bounds = (column: string) =>
                row
                    .querySelector(`[data-bookmark-column="${column}"]`)
                    ?.getBoundingClientRect();
            return {
                actionsLeft: bounds('actions')?.left ?? 0,
                bookmarkRight: bounds('bookmark')?.right ?? 0,
                savedLeft: bounds('saved')?.left ?? 0,
                savedRight: bounds('saved')?.right ?? 0,
                sourceLeft: bounds('source')?.left ?? 0,
                sourceRight: bounds('source')?.right ?? 0,
            };
        });
    expect(bookmarkColumns.bookmarkRight).toBeLessThan(
        bookmarkColumns.sourceLeft,
    );
    expect(bookmarkColumns.sourceRight).toBeLessThan(bookmarkColumns.savedLeft);
    expect(bookmarkColumns.savedRight).toBeLessThan(
        bookmarkColumns.actionsLeft,
    );
    let releaseGalleryNavigation = () => {};
    let reportGalleryRequest = () => {};
    const galleryNavigationGate = new Promise<void>((resolve) => {
        releaseGalleryNavigation = resolve;
    });
    const galleryRequestStarted = new Promise<void>((resolve) => {
        reportGalleryRequest = resolve;
    });
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('view') !== 'gallery') {
            await route.continue();
            return;
        }
        reportGalleryRequest();
        await galleryNavigationGate;
        await route.continue();
    });
    const galleryNavigation = page
        .getByRole('link', { name: 'Gallery view' })
        .click();
    await galleryRequestStarted;
    await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
    releaseGalleryNavigation();
    await galleryNavigation;
    await page.unroute('**/*');
    await expect(page).toHaveURL(/view=gallery/u);
    await expect(
        page.getByRole('list', { name: 'Bookmarks in gallery view' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'List view' }).click();
    await expect(page).toHaveURL(/view=list/u);
    await expect(
        page.getByRole('list', { name: 'Bookmarks in list view' }),
    ).toBeVisible();

    await page.goto('/?q=cloudflare');
    await expect(page.getByText('Phase Two Bookmark')).toBeVisible();
    await page.locator('a[href^="/b/"]').first().click();
    await expect(
        page.getByRole('heading', { name: 'Phase Two Bookmark' }),
    ).toBeVisible();

    await page.goto('/admin/bookmarks');
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('Updated Phase Two Bookmark');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(
        page
            .getByRole('link', {
                exact: true,
                name: 'Updated Phase Two Bookmark',
            })
            .first(),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await page
        .locator('summary')
        .filter({ hasText: /^Delete bookmark$/u })
        .click();
    await page.getByRole('button', { name: 'Delete bookmark' }).click();
    await expect(page.getByLabel('Confirmation phrase')).toBeFocused();
    await page.getByLabel('Confirmation phrase').fill('DELETE');
    await page.getByRole('button', { name: 'Delete permanently' }).click();
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
    const { stdout: shaarliUpdateOutput } = await execute(
        'bunx',
        d1Arguments(`
            UPDATE bookmarks
            SET shaarli_short_url = 'captured'
            WHERE url = 'https://example.com/captured';
            INSERT INTO outbox (
                id, bookmark_short_url, kind, state, payload_version,
                created_at, updated_at
            )
            SELECT
                'e2e-review-outbox', short_url, 'social', 'completed', 1,
                1, 1
            FROM bookmarks
            WHERE url = 'https://example.com/captured';
            INSERT INTO jobs (
                id, outbox_id, bookmark_short_url, kind, state,
                payload_version, created_at, updated_at
            )
            SELECT
                'e2e-review-job', 'e2e-review-outbox', short_url, 'social',
                'needs_review', 1, 1, 1
            FROM bookmarks
            WHERE url = 'https://example.com/captured';
            INSERT INTO social_deliveries (
                id, bookmark_short_url, provider, state, formatting_version,
                source_json, attempts, available_at, created_at, updated_at
            )
            SELECT
                'e2e-review-job', short_url, 'twitter', 'needs_review', 1,
                '{}', 1, 0, 1, 1
            FROM bookmarks
            WHERE url = 'https://example.com/captured';
        `),
    );
    expect(shaarliUpdateOutput).toContain('success');
    const shaarliRedirect = await context.request.get('/shaare/captured', {
        maxRedirects: 0,
    });
    expect(shaarliRedirect.status()).toBe(301);
    expect(shaarliRedirect.headers().location).toMatch(
        /^\/b\/[A-Za-z0-9]{8}$/u,
    );
    await duplicatePopup.waitForURL(/\/bookmarklet\?/u);
    await duplicatePopup.getByRole('button', { name: 'Close' }).click();

    await page.goto('/admin/dashboard?period=30d');
    await expect(
        page.getByRole('heading', { name: 'Overview', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Total bookmarks')).toBeVisible();
    await expect(
        page.getByRole('img', { name: /Daily bookmark activity:/u }),
    ).toBeVisible();
    await expect(
        page.getByRole('img', {
            name: /example\.com: \d+ bookmarks/u,
        }),
    ).toBeVisible();
    await page.setViewportSize({ height: 844, width: 390 });
    const mobileMenu = page.locator('summary').filter({ hasText: /^Menu$/u });
    await mobileMenu.click();
    await expect(
        page.getByRole('link', { name: 'Bookmarks', exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.getByRole('link', { name: 'Bookmarks', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/bookmarks$/u);
    await expect(mobileMenu.locator('..')).not.toHaveAttribute('open', '');
    await page.setViewportSize({ height: 900, width: 1280 });

    await page.goto('/admin/data');
    await expect(
        page.getByRole('heading', { name: 'Data & recovery', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Source format')).toBeVisible();
    await expect(page.getByLabel('Full backup file')).toBeVisible();

    await page.goto('/admin/settings');
    await page.getByLabel('Twitter API key').fill('browser-test-key');
    await page.getByLabel('Feed item count').fill('250');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page).toHaveURL(/\/admin\/settings\?saved=1$/u);
    await expect(page.getByLabel('Twitter API key')).toHaveValue(
        'browser-test-key',
    );
    await expect(page.getByLabel('Feed item count')).toHaveValue('250');

    const noJavaScriptContext = await browser.newContext({
        javaScriptEnabled: false,
    });
    await noJavaScriptContext.addCookies(await context.cookies());
    const noJavaScriptAdmin = await noJavaScriptContext.newPage();
    await noJavaScriptAdmin.goto('/admin/bookmarks');
    await expect(
        noJavaScriptAdmin.getByRole('heading', {
            exact: true,
            name: 'Bookmarks',
        }),
    ).toBeVisible();
    await expect(
        noJavaScriptAdmin
            .locator('#main-content')
            .getByRole('link', { name: 'New bookmark' }),
    ).toBeVisible();
    await noJavaScriptAdmin
        .locator('summary')
        .filter({ hasText: /^Danger zone$/u })
        .click();
    await noJavaScriptAdmin
        .getByLabel('Type DELETE ALL BOOKMARKS to confirm')
        .fill('delete all bookmarks');
    await noJavaScriptAdmin
        .getByRole('button', { name: 'Delete everything' })
        .click();
    await expect(
        noJavaScriptAdmin.getByText(
            'Type DELETE ALL BOOKMARKS exactly to confirm.',
        ),
    ).toBeVisible();
    await expect(
        noJavaScriptAdmin.getByRole('link', { name: 'Edit' }).first(),
    ).toBeVisible();
    const editHref = await noJavaScriptAdmin
        .getByRole('link', { name: 'Edit' })
        .first()
        .getAttribute('href');
    expect(editHref).toBeTruthy();
    await noJavaScriptAdmin.goto(editHref ?? '/admin/bookmarks');
    await noJavaScriptAdmin
        .locator('summary')
        .filter({ hasText: /^Delete bookmark$/u })
        .click();
    await expect(
        noJavaScriptAdmin.getByRole('button', {
            name: 'Delete permanently',
        }),
    ).toBeVisible();

    const administratorRoutes: ReadonlyArray<readonly [string, string]> = [
        ['/admin/dashboard', 'Overview'],
        ['/admin/bookmarks', 'Bookmarks'],
        ['/admin/bookmarks/new', 'New bookmark'],
        [editHref ?? '/admin/bookmarks', 'Edit bookmark'],
        ['/admin/jobs', 'Background work'],
        ['/admin/data', 'Data & recovery'],
        ['/admin/settings', 'Settings'],
        ['/admin/security', 'Security'],
        ['/bookmarklet', 'Install bookmarklet'],
    ];
    const desktopMainWidths: number[] = [];
    for (const width of [1600, 320]) {
        await noJavaScriptAdmin.setViewportSize({ height: 800, width });
        for (const [path, heading] of administratorRoutes) {
            await noJavaScriptAdmin.goto(path);
            await expect(
                noJavaScriptAdmin.getByRole('heading', {
                    exact: true,
                    name: heading,
                }),
            ).toBeVisible();
            const main = noJavaScriptAdmin.locator('#main-content');
            const sidebar = noJavaScriptAdmin.locator(
                'aside[data-admin-sidebar]',
            );
            if (path === '/admin/bookmarks/new') {
                await expect(
                    noJavaScriptAdmin.getByRole('button', {
                        name: 'Fetch metadata',
                    }),
                ).toHaveCount(0);
            }
            if (path === '/admin/security') {
                await expect(
                    noJavaScriptAdmin.getByRole('button', {
                        name: 'Replace passkey',
                    }),
                ).toHaveCount(0);
            }
            if (path === '/admin/jobs') {
                await expect(
                    noJavaScriptAdmin.getByRole('button', {
                        name: 'Review',
                    }),
                ).toHaveCount(0);
                await expect(
                    noJavaScriptAdmin.getByRole('button', {
                        name: 'Mark delivered',
                    }),
                ).toBeVisible();
                await expect(
                    noJavaScriptAdmin.getByRole('button', {
                        name: 'Retry despite risk',
                    }),
                ).toBeVisible();
            }
            if (width === 320) {
                await expect(sidebar).toBeHidden();
                await expect(
                    noJavaScriptAdmin
                        .locator('summary')
                        .filter({ hasText: /^Menu$/u }),
                ).toBeVisible();
            } else {
                await expect(sidebar).toBeVisible();
                const mainBox = await main.boundingBox();
                expect(mainBox?.width).toBeLessThanOrEqual(1280);
                if (mainBox !== null) {
                    desktopMainWidths.push(Math.round(mainBox.width));
                }
            }
            expect(
                await noJavaScriptAdmin.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);
        }
    }
    expect(new Set(desktopMainWidths).size).toBe(1);
    await noJavaScriptAdmin
        .locator('summary')
        .filter({ hasText: /^Menu$/u })
        .click();
    await expect(
        noJavaScriptAdmin.getByRole('link', {
            exact: true,
            name: 'Bookmarks',
        }),
    ).toBeVisible();
    await noJavaScriptContext.close();

    await page.goto('/admin/data');
    await page.getByRole('button', { name: 'Create full backup' }).click();
    await expect(
        page.getByText('Backup file ready to download.').first(),
    ).toBeVisible({ timeout: 30_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
        /^gongyu-backup-.+\.backup\.json$/u,
    );
    expect(await download.path()).not.toBeNull();

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
    await page.getByRole('button', { name: 'Replace passkey' }).click();
    const replacementReload = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Replace now' }).click();
    await replacementReload;
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
    const expectedTitle = 'Captured page';
    const context = await browser.newContext({
        baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? '5173'}`,
        javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const query = expectedTitle.split(/\s+/u)[0] ?? expectedTitle;
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search bookmarks' }).fill(query);
    await page.getByRole('button', { name: 'Search bookmarks' }).click();
    await expect(page).toHaveURL(/\/search\?.*q=Captured/u);
    await expect(page.getByText(expectedTitle)).toBeVisible();
    await expect(
        page.getByRole('list', { name: 'Bookmarks in list view' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Gallery view' }).click();
    await expect(page).toHaveURL(/view=gallery/u);
    await expect(
        page.getByRole('list', { name: 'Bookmarks in gallery view' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'List view' }).click();
    await expect(page).toHaveURL(/view=list/u);
    const publicHtml = await page.content();
    expect(publicHtml).not.toContain('thumbnailCleanupKey');
    expect(publicHtml).not.toContain('thumbnailKey');
    const resultArticle = page
        .locator('article')
        .filter({ hasText: expectedTitle })
        .first();
    const originalLink = resultArticle.getByRole('link', {
        exact: true,
        name: expectedTitle,
    });
    await expect(originalLink).toHaveAttribute('target', '_blank');
    const detailLink = resultArticle.getByRole('link', { name: 'Details' });
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(
        page.getByRole('heading', { name: expectedTitle }),
    ).toBeVisible();
    const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href');
    expect(canonical).toMatch(/\/b\/[A-Za-z0-9]{8}$/u);
    expect(
        await page.locator('meta[property="og:url"]').getAttribute('content'),
    ).toBe(canonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(0);
    expect(
        await page.locator('meta[name="twitter:card"]').getAttribute('content'),
    ).toBe('summary');
    await page.setViewportSize({ height: 800, width: 320 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);

    const missingShaarliRedirect = await context.request.get(
        '/shaare/not-a-known-hash',
        { maxRedirects: 0 },
    );
    expect(missingShaarliRedirect.status()).toBe(404);

    const feed = await context.request.get('/feed');
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain(expectedTitle);
    await context.close();
});

test('does not expose the storage spike endpoints', async ({ request }) => {
    expect(
        (
            await request.post('/api/phase0/uploads', {
                data: '{}',
                headers: { 'Content-Type': 'application/json' },
            })
        ).status(),
    ).toBe(404);
    expect(
        (
            await request.post('/api/phase0/workflows', {
                data: {},
            })
        ).status(),
    ).toBe(404);
    expect((await request.get('/storage')).status()).toBe(404);
});
