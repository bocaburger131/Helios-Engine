import { vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import Redis from 'ioredis';
import { createTestMongoServer } from './utils/mongoMemory.js';

// Minimal valid 1-page PDF bytes used as the default readFileSync return value
// so that upload controllers that read from disk don't crash with undefined.
const MINIMAL_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n'
);

function wantsPdfBuffer(filePath) {
  const p = String(filePath).replace(/\\/g, '/');
  return (
    p.endsWith('.pdf') ||
    p.includes('/triage/') ||
    p.includes('/uploads/') ||
    p.includes('statement') && p.endsWith('.pdf')
  );
}

// Mock fs — delegate to real fs for JSON/schemas; PDF buffer only for upload/triage paths
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  const actualFs = actual.default ?? actual;

  const readFileSync = vi.fn((filePath, options) => {
    if (wantsPdfBuffer(filePath)) return MINIMAL_PDF_BUFFER;
    return actualFs.readFileSync(filePath, options);
  });

  const createReadStream = vi.fn((filePath, options) => {
    if (wantsPdfBuffer(filePath)) {
      const readable = new Readable();
      readable.push(MINIMAL_PDF_BUFFER);
      readable.push(null);
      return readable;
    }
    return actualFs.createReadStream(filePath, options);
  });

  const readFile = vi.fn(async (filePath, options) => {
    if (wantsPdfBuffer(filePath)) return MINIMAL_PDF_BUFFER;
    return actualFs.promises.readFile(filePath, options);
  });

  const fsMock = {
    ...actualFs,
    readFileSync,
    createReadStream,
    promises: {
      ...actualFs.promises,
      readFile
    }
  };

  return {
    ...actual,
    default: fsMock,
    readFileSync,
    createReadStream,
    existsSync: actualFs.existsSync.bind(actualFs),
    rmSync: actualFs.rmSync?.bind(actualFs) ?? vi.fn(),
    writeFileSync: actualFs.writeFileSync?.bind(actualFs) ?? vi.fn(),
    mkdirSync: actualFs.mkdirSync?.bind(actualFs) ?? vi.fn(),
    readdirSync: actualFs.readdirSync?.bind(actualFs) ?? vi.fn(() => []),
    statSync: actualFs.statSync?.bind(actualFs) ?? vi.fn(() => ({ size: 1024, isFile: () => true })),
    createWriteStream: actualFs.createWriteStream?.bind(actualFs) ?? vi.fn()
  };
});

vi.mock('../src/services/perplexityService.js', () => {
  class MockPerplexityService {
    constructor() {
      this.analyzeText = vi.fn().mockResolvedValue({ analysis: { text: 'mock perplexity' } });
    }
  }
  return {
    PerplexityService: MockPerplexityService,
    default: MockPerplexityService
  };
});

// Mock the logger globally
vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

let mongoServer;
let mongoAvailable = false;

// MongoDB Memory Server Setup (optional — pure unit tests run if binary download fails)
beforeAll(async () => {
  try {
    mongoServer = await createTestMongoServer();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    mongoAvailable = true;
  } catch (err) {
    console.warn(
      '[vitest.setup] MongoMemoryServer unavailable — DB-dependent tests may fail:',
      err.message
    );
    mongoAvailable = false;
  }
});

// Clear all collections before each test
beforeEach(async () => {
  if (mongoAvailable && mongoose.connection?.collections) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany();
    }
  }
  
  // Reset all mocks
  vi.clearAllMocks();
  
  // Reset Redis mock data
  mockRedisClient.data.clear();
});

// Disconnect and cleanup after tests
afterAll(async () => {
  if (mongoServer && mongoAvailable) {
    await mongoose.connection.close();
    await mongoServer.stop();
  }
});

// --- Global Mocks ---

// Mock Redis client
class MockRedisClient extends EventEmitter {
  constructor() {
    super();
    this.data = new Map();
    this.connected = true;
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async set(key, value, mode, duration) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key) {
    this.data.delete(key);
    return 1;
  }

  async quit() {
    this.connected = false;
    return 'OK';
  }
}

const mockRedisClient = new MockRedisClient();
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => mockRedisClient)
  };
});

// Build a Mongoose-like query chain that is thenable (supports await)
const makeQueryChain = (resolvedValue) => {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(resolvedValue),
    exec: vi.fn().mockResolvedValue(resolvedValue),
    then: (resolve, reject) => Promise.resolve(resolvedValue).then(resolve, reject),
    catch: (fn) => Promise.resolve(resolvedValue).catch(fn),
    finally: (fn) => Promise.resolve(resolvedValue).finally(fn)
  };
  return chain;
};

// Create a mock model factory
const createMockModel = (modelName) => {
  const MockModel = vi.fn().mockImplementation((data) => {
    return {
      ...data,
      save: vi.fn().mockResolvedValue(data),
      toObject: vi.fn().mockReturnValue(data)
    };
  });

  // Static methods — find/findOne/findById return thenable chains
  MockModel.find = vi.fn().mockImplementation(() => makeQueryChain([]));
  MockModel.findOne = vi.fn().mockImplementation(() => makeQueryChain(null));
  MockModel.findById = vi.fn().mockImplementation(() => makeQueryChain(null));
  MockModel.create = vi.fn().mockImplementation(async (data) => new MockModel(data));
  MockModel.updateOne = vi.fn().mockResolvedValue({ nModified: 1 });
  MockModel.findByIdAndUpdate = vi.fn().mockResolvedValue(null);
  MockModel.deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
  MockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
  MockModel.countDocuments = vi.fn().mockResolvedValue(0);
  MockModel.insertMany = vi.fn().mockImplementation(async (docs) => docs);
  MockModel.aggregate = vi.fn().mockResolvedValue([]);

  return MockModel;
};

// Initialize mock models
const UserModel = createMockModel('User');
const StatementModel = createMockModel('Statement');
const TransactionCategoryModel = createMockModel('TransactionCategory');

// Add custom methods for TransactionCategory model
TransactionCategoryModel.findCachedCategory = vi.fn().mockImplementation(async (description) => null);
TransactionCategoryModel.cacheCategory = vi.fn().mockImplementation(async (description, category, confidence, source) => {
  return {
    description,
    category,
    confidence,
    source
  };
});

// Attach mock models to global scope
global.User = UserModel;
global.Statement = StatementModel;
global.TransactionCategory = TransactionCategoryModel;

// Enhanced User-specific mock behaviors
UserModel.findOne.mockImplementation((query) => {
  if (query?.email === 'test@example.com' || query?.email === 'existing@example.com') {
    return makeQueryChain(new UserModel({
      _id: '507f1f77bcf86cd799439011',
      email: query.email,
      name: 'Test User',
      // A properly formatted bcrypt hash so bcrypt.compare returns false cleanly instead of throwing
      password: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      role: 'user'
    }));
  }
  return makeQueryChain(null);
});

UserModel.findById.mockImplementation((id) => {
  const idStr = id?.toString();
  if (idStr === '507f1f77bcf86cd799439011' || idStr === 'valid-user-id' || idStr === '6765d4b8a1b2c3d4e5f6a7b8') {
    return makeQueryChain(new UserModel({
      _id: idStr,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    }));
  }
  return makeQueryChain(null);
});

// Enhanced Statement-specific mock behaviors — still return thenable chains
StatementModel.findOne.mockImplementation((query) => {
  if (query?._id === '507f1f77bcf86cd799439022') {
    return makeQueryChain(new StatementModel({
      _id: '507f1f77bcf86cd799439022',
      filename: 'test-statement.pdf',
      userId: '507f1f77bcf86cd799439011',
      transactions: [],
      analysisResults: {},
      alerts: []
    }));
  }
  return makeQueryChain(null);
});

StatementModel.findById.mockImplementation((id) => {
  if (id === '507f1f77bcf86cd799439022') {
    return makeQueryChain(new StatementModel({
      _id: '507f1f77bcf86cd799439022',
      filename: 'test-statement.pdf',
      userId: '507f1f77bcf86cd799439011'
    }));
  }
  return makeQueryChain(null);
});
