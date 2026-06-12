// Multer mock for integration tests
import { vi } from 'vitest';

// Mock multer middleware with all necessary methods
const mockMulter = {
  single: vi.fn(() => (req, res, next) => {
    req.file = {
      filename: 'test.pdf',
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      path: '/tmp/test.pdf',
      buffer: Buffer.from('test file content')
    };
    next();
  }),
  array: vi.fn(() => (req, res, next) => {
    req.files = [
      {
        filename: 'test1.pdf',
        originalname: 'test1.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/test1.pdf',
        buffer: Buffer.from('test file content')
      }
    ];
    next();
  }),
  fields: vi.fn(() => (req, res, next) => {
    req.files = {
      statements: [
        {
          filename: 'test1.pdf',
          originalname: 'test1.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          path: '/tmp/test1.pdf',
          buffer: Buffer.from('test file content')
        }
      ]
    };
    next();
  }),
  // Static methods that multer provides
  memoryStorage: vi.fn(() => ({
    _handleFile: vi.fn((req, file, cb) => {
      file.buffer = Buffer.from('test file content');
      cb(null, {
        buffer: file.buffer,
        size: file.buffer.length
      });
    }),
    _removeFile: vi.fn((req, file, cb) => cb())
  })),
  diskStorage: vi.fn((options = {}) => ({
    _handleFile: vi.fn((req, file, cb) => {
      const filename = options.filename ? options.filename(req, file, cb) : 'test.pdf';
      const destination = options.destination ? options.destination(req, file, cb) : '/tmp';
      cb(null, {
        filename,
        destination,
        path: `${destination}/${filename}`,
        size: 1024
      });
    }),
    _removeFile: vi.fn((req, file, cb) => cb())
  }))
};

// Create a mock constructor that also has static methods
const mockMulterConstructor = Object.assign(
  // Constructor function that returns mockMulter
  (options = {}) => mockMulter,
  // Static methods
  {
    memoryStorage: mockMulter.memoryStorage,
    diskStorage: mockMulter.diskStorage
  }
);

// Mock multer
vi.mock('multer', () => ({
  default: mockMulterConstructor
}));
