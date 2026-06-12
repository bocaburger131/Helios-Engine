import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/unit/**/*.test.js', 'test/unit/**/*.test.js'],
    exclude: ['node_modules/**', '_LEGACY_ARCHIVE/**']
  }
});
