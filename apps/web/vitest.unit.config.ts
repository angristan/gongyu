import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'unit',
        environment: 'node',
        include: ['test/unit/**/*.test.ts'],
    },
});
