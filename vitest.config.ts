import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./scripts/test-setup.mjs'],
    testTimeout: 20000,
    pool: 'forks',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportsDirectory: 'qa-report/evidence/coverage',
    },
  },
});
