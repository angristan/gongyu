import path from 'node:path';
import {
    cloudflareTest,
    readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
    const migrations = await readD1Migrations(
        path.resolve(import.meta.dirname, '../../migrations'),
    );

    return {
        plugins: [
            cloudflareTest({
                miniflare: {
                    bindings: {
                        TEST_MIGRATIONS: migrations,
                    },
                },
                wrangler: {
                    configPath: './wrangler.jsonc',
                },
            }),
        ],
        test: {
            setupFiles: ['./test/apply-migrations.ts'],
        },
    };
});
