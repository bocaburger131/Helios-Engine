// FILE: jest.config.cjs

module.exports = {
  testEnvironment: 'node',
  // This tells Jest to use Babel, which will automatically find babel.config.cjs
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  
  // This handles your @ path alias and mocks the pdf-parse library
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    'pdf-parse': '<rootDir>/tests/__mocks__/pdf-parse.js',
  },

  // This pattern correctly finds files in BOTH /test and /tests
  testMatch: [
    '**/test/**/*.test.js',
    '**/tests/**/*.test.js',
  ],

  // This points to your ESM-compatible setup file
  setupFilesAfterEnv: ['./tests/jest.setup.mjs'],

  verbose: true,
  testTimeout: 30000,
  
  // No longer need to ignore pdf-parse here because it's mocked above
  transformIgnorePatterns: [
    'node_modules/(?!(axios|@jest/globals)/)',
  ],
};