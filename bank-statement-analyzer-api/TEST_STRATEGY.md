# Test Strategy for Bank Statement Analyzer API

## Test Structure Improvements

### Phase 1: Basic Infrastructure
1. Fix vitest.config.js with proper aliases
2. Fix tests/setup.js with database helpers and environment setup
3. Fix basic utility tests (errors.js, logger.js)

### Phase 2: Core Services
1. Fix PDF Parser Service tests
2. Fix LLM Service tests
3. Fix Transaction Analysis Service tests

### Phase 3: Database and Models
1. Fix Transaction Model tests
2. Fix Statement Model tests
3. Fix Repository tests

### Phase 4: Controllers and Routes
1. Fix Controller tests
2. Fix Middleware tests
3. Fix Route tests

### Phase 5: Integration Tests
1. Fix API integration tests
2. Fix end-to-end tests

## Test Patterns to Follow

### Module Mocking
Always follow this pattern:
```javascript
// Define any variables needed by mocks first
const mockThing = { method: vi.fn() };

// Mock dependencies before importing the modules under test
vi.mock('module-to-mock', () => ({
  default: mockThing, // or vi.fn() if it's a function
  namedExport: vi.fn()
}));

// Now import the module under test
import { thing } from '../src/thing.js';
```

### Database Connection Management
For tests requiring a database connection, use the following pattern:
```javascript
beforeAll(async () => {
  await global.connectDB();
});

afterAll(async () => {
  await global.disconnectDB();
});

beforeEach(async () => {
  await global.clearDatabase();
});
```

## API Tests
import request from 'supertest';
import app from '../src/app.js';

describe('API Tests', () => {
  beforeAll(async () => {
    await global.connectDB();
  });

  afterAll(async () => {
    await global.disconnectDB();
  });

  it('should return 200 OK', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });
});