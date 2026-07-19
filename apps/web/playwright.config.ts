import { defineConfig, devices } from '@playwright/test';

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
                channel: 'chrome',
            },
        },
    ],
    reporter: 'list',
    testDir: './e2e',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command:
            'bunx wrangler d1 migrations apply gongyu-phase0-local --local && bunx wrangler d1 execute gongyu-phase0-local --local --command="DELETE FROM phase0_webauthn_challenges; DELETE FROM phase0_passkey; DELETE FROM phase0_workflow_runs" && bun run build && bunx vite preview --host localhost --port 5173',
        reuseExistingServer: false,
        timeout: 120_000,
        url: 'http://localhost:5173',
    },
    workers: 1,
});
