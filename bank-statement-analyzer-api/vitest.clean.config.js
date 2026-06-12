import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/riskAnalysisService-clean.test.js'],
    // No setup files to avoid mocking
    setupFiles: [],
    globals: false,
    testTimeout: 10000
  }
});
