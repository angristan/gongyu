import { defineConfig, devices } from '@playwright/test';

const stagingBaseUrl = process.env.STAGING_BASE_URL;
const localPort = process.env.PLAYWRIGHT_PORT ?? '5173';
const localBaseUrl = `http://localhost:${localPort}`;

export default defineConfig({
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    projects: [
        {
            name: 'chrome',
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.CI === undefined ? 'chrome' : undefined,
            },
        },
    ],
    reporter: 'list',
    testDir: './e2e',
    use: {
        baseURL: stagingBaseUrl ?? localBaseUrl,
        trace: 'retain-on-failure',
    },
    webServer:
        stagingBaseUrl === undefined
            ? {
                  command: `bunx wrangler d1 migrations apply gongyu-local --local && bunx wrangler d1 execute gongyu-local --local --command="DELETE FROM sessions; DELETE FROM webauthn_challenges; DELETE FROM passkeys; DELETE FROM jobs; DELETE FROM outbox; DELETE FROM data_run_errors; DELETE FROM data_runs; DELETE FROM bookmarks" && bun run build && bun -e "const p='build/server/wrangler.json'; const config=await Bun.file(p).json(); config.vars.RP_ORIGIN='${localBaseUrl}'; await Bun.write(p, JSON.stringify(config))" && bunx vite preview --host localhost --port ${localPort}`,
                  reuseExistingServer: false,
                  timeout: 120_000,
                  url: localBaseUrl,
              }
            : undefined,
    workers: 1,
});
