import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    reporters: ['default', 'html'],
    outputFile: 'test-results/index.html',
    // Use happy-dom for better Node.js compatibility with DOM tests
    environment: 'happy-dom',
    globals: true,
    
    setupFiles: [
      './tests/vitest.setup.js'
    ],
    
    // CRITICAL: Comprehensive exclusion of third-party tests
    exclude: [
      // Debug/temporary test files
      'debug-statement-controller.test.js',
      'debug-*.test.js',
      'src/routes/AuthRoute.test.js', // Fixed: Variables now properly declared
      
      // Third-party node_modules tests (CRITICAL for preventing 100+ false failures)
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.{git,cache,output,temp}/**',
      '**/coverage/**',
      
      // Exclude client-side tests
      '**/client/**',
      '**/bank-statement-analyzer-ui/**',
      
      // Exclude specific third-party test patterns that were causing failures
      '**/@reduxjs/**',
      '**/react-dropzone/**',
      '**/tsconfig-paths/**',
      '**/gensync/**',
      '**/workbox-build/**',
      '**/jpeg-exif/**',
      '**/fast-uri/**',
      '**/@sinonjs/**',
      '**/@bcoe/**',
      '**/@surma/**',
      '**/@testing-library/**',
      '**/png-js/**',
      '**/jest-worker/**',
      '**/rimraf/**',
      '**/glob/**',
      '**/minipass/**',
      '**/tar/**'
    ],
    
    // Only include OUR test files - be very specific to avoid third-party tests
    include: [
      'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      // Exclude debug files by not including debug-*.test.js patterns
    ],
    
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Use threads for better isolation and prevent cross-test contamination
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: true
      }
    },
    
    // Prevent test pollution from third-party modules
    maxConcurrency: 1,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      REDIS_URL: 'redis://localhost:6379',
      REDIS_MOCK: 'true',
      USE_REDIS: 'false',
      PERPLEXITY_API_KEY: 'pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      BYPASS_PERPLEXITY: 'true',
      ZOHO_CLIENT_ID: 'test-zoho-id',
      ZOHO_CLIENT_SECRET: 'test-zoho-secret',
      ZOHO_REFRESH_TOKEN: 'test-zoho-refresh',
      // Auth must be disabled=false in tests so 401/403 behavior is exercised
      DISABLE_AUTH: 'false',
      DISABLE_ZOHO: 'true',
      APP_MODE: 'test'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});