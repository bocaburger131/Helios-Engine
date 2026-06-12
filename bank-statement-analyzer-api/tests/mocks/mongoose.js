// Mongoose mock for integration tests
import { vi } from 'vitest';

// Mock models registry
const mockModels = {};

// Define Types that can be used both as static property and instance property
const mockTypes = {
  ObjectId: String,
  String: String,
  Number: Number,
  Date: Date,
  Boolean: Boolean,
  Array: Array,
  Mixed: Object
};

// Mock mongoose completely
vi.mock('mongoose', () => {
  // Create the Schema class
  class MockSchema {
    constructor(definition, options) {
      this.definition = definition;
      this.options = options;
      this.indexes = [];
      this.middleware = { pre: [], post: [] };
      return this;
    }
    
    index(fields, options) {
      this.indexes.push({ fields, options });
      return this;
    }
    
    pre(method, fn) {
      this.middleware.pre.push({ method, fn });
      return this;
    }
    
    post(method, fn) {
      this.middleware.post.push({ method, fn });
      return this;
    }
    
    virtual(path) {
      return {
        get: vi.fn(),
        set: vi.fn()
      };
    }
    
    // Instance property
    get Types() {
      return mockTypes;
    }
  }
  
  // Add static property after class definition
  MockSchema.Types = mockTypes;

  const mockMongoose = {
    Schema: MockSchema,
    models: mockModels, // Shared models registry
    model: vi.fn((name, schema) => {
      // Check if model already exists
      if (mockModels[name]) {
        return mockModels[name];
      }
      
      // Create new mock model constructor
      const MockModel = function(data) {
        Object.assign(this, data);
        this._id = 'mock-id-' + Math.random().toString(36).substr(2, 9);
        return this;
      };
      
      // Static methods
      MockModel.find = vi.fn().mockImplementation((query) => {
        // Return a mock query object that supports chaining
        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([]),
          // Make it thenable so it can be awaited directly
          then: vi.fn((resolve) => {
            resolve([]);
            return Promise.resolve([]);
          })
        };
        return mockQuery;
      });
      MockModel.findOne = vi.fn().mockResolvedValue(null);
      MockModel.findById = vi.fn().mockImplementation((id) => {
        // Return a test user for the authentication test
        if (id === '123') {
          const mockUser = {
            _id: '123',
            id: '123',
            email: 'test@example.com',
            name: 'Test User',
            isActive: true,
            role: 'user'
          };
          
          // Mock the select method to return the user without password
          return Promise.resolve({
            ...mockUser,
            select: vi.fn().mockResolvedValue(mockUser)
          });
        }
        return Promise.resolve(null);
      });
      MockModel.create = vi.fn().mockResolvedValue({});
      MockModel.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      MockModel.deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
      MockModel.countDocuments = vi.fn().mockResolvedValue(0);
      
      // Instance methods
      MockModel.prototype.save = vi.fn().mockResolvedValue(this);
      MockModel.prototype.remove = vi.fn().mockResolvedValue(this);
      MockModel.prototype.toObject = vi.fn().mockReturnValue(this);
      MockModel.prototype.toJSON = vi.fn().mockReturnValue(this);
      
      // Store in models registry
      mockModels[name] = MockModel;
      
      return MockModel;
    }),
    connect: vi.fn().mockResolvedValue({}),
    disconnect: vi.fn().mockResolvedValue({}),
    connection: {
      readyState: 1,
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn()
    },
    Types: mockTypes // Also expose Types at the top level
  };
  
  return { default: mockMongoose };
});
