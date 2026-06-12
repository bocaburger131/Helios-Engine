import { vi } from 'vitest';

const Schema = class Schema {
  constructor(definition) {
    this.definition = definition;
    this.methods = {};
    this.statics = {};
    this.virtuals = {};
    this.indexes = [];
    this.pre = vi.fn();
    this.post = vi.fn();
    this.plugin = vi.fn(); // Add plugin method
  }
  
  index(fields, options) {
    this.indexes.push({ fields, options });
    return this;
  }
  
  plugin(plugin, options) {
    // Mock plugin method
    return this;
  }
  
  virtual(name) {
    const virtual = {
      get: (fn) => {
        this.virtuals[name] = { get: fn };
        return virtual;
      },
      set: (fn) => {
        this.virtuals[name] = { ...this.virtuals[name], set: fn };
        return virtual;
      }
    };
    return virtual;
  }
};

Schema.Types = {
  ObjectId: class ObjectId {
    constructor(id) {
      if (id) {
        this.id = id;
      } else {
        // Use a counter to ensure unique but predictable IDs for testing
        if (!ObjectId.counter) ObjectId.counter = 0;
        ObjectId.counter++;
        // Create unique IDs that are clearly different
        this.id = `6765d4b8a1b2c3d4e5f6a7b${ObjectId.counter.toString().padStart(2, '0')}`;
      }
    }
    toString() {
      return this.id;
    }
  }
};

const mongoose = {
  Schema,
  model: vi.fn((name, schema) => {
    const Model = class {
      constructor(data) {
        Object.assign(this, data);
        if (data._id) {
          this._id = data._id;
        } else {
          const objectId = new Schema.Types.ObjectId();
          this._id = objectId.toString(); // Use the string representation
        }
      }
      
      save() {
        return Promise.resolve(this);
      }
      
      static create(data) {
        if (Array.isArray(data)) {
          return Promise.resolve(data.map(item => new Model(item)));
        }
        const instance = new Model(data);
        
        // Store created instance for findById to work
        if (!this.createdInstances) {
          this.createdInstances = new Map();
        }
        this.createdInstances.set(instance._id, instance);
        
        return Promise.resolve(instance);
      }
      
      static find(query) {
        // For Transaction.find({ statementId: ... }) in tests
        if (query && query.statementId) {
          // Return mock transactions for testing
          return Promise.resolve([
            {
              _id: 'tx1',
              statementId: query.statementId,
              date: new Date('2024-01-10'),
              description: 'Sample Transaction 1',
              amount: -50.00,
              category: 'Food'
            },
            {
              _id: 'tx2',
              statementId: query.statementId,
              date: new Date('2024-01-12'),
              description: 'Sample Transaction 2',
              amount: 1000.00,
              category: 'Salary'
            }
          ]);
        }
        
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([])
        };
      }
      
      static async findById(id) {
        // Check if this ID was deleted
        if (this.deletedIds && this.deletedIds.has(id)) {
          return null;
        }
        
        // Check if this was a created instance
        if (this.createdInstances && this.createdInstances.has(id)) {
          const instance = this.createdInstances.get(id);
          return instance;
        }
        
        return null;
      }
      
      static findByIdAndDelete(id) {
        // Track deletion
        if (!this.deletedIds) {
          this.deletedIds = new Set();
        }
        this.deletedIds.add(id);
        
        // Return the deleted document (mock)
        return Promise.resolve({
          _id: id,
          userId: '6765d4b8a1b2c3d4e5f6a7b8' // Mock user ID
        });
      }
      
      static async findOne(query) {
        // Check if this was a created instance that matches the query
        if (this.createdInstances && query) {
          for (const [id, instance] of this.createdInstances.entries()) {
            // Check if deleted
            if (this.deletedIds && this.deletedIds.has(id)) {
              continue;
            }
            
            // If query has _id, check if it matches
            if (query._id && query._id !== id) {
              continue;
            }
            
            // If query has userId, check if it matches
            if (query.userId && instance.userId && instance.userId.toString() !== query.userId.toString()) {
              continue;
            }
            
            // If we get here, it's a match
            return instance;
          }
        }
        
        return null;
      }
      
      static deleteOne(query) {
        return Promise.resolve({ deletedCount: 1 });
      }
      
      static deleteMany(query) {
        return Promise.resolve({ deletedCount: 1 });
      }
      
      static insertMany(data) {
        if (Array.isArray(data)) {
          return Promise.resolve(data.map(item => new Model(item)));
        }
        return Promise.resolve([new Model(data)]);
      }
      
      static updateOne(query, update) {
        return Promise.resolve({ modifiedCount: 1 });
      }
      
      updateOne(update) {
        return Promise.resolve({ modifiedCount: 1 });
      }
    };
    
    return Model;
  }),
  Types: Schema.Types,
  Error: {
    ValidationError: class ValidationError extends Error {
      constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.errors = {};
      }
    }
  },
  connection: {
    readyState: 1,
    collection: vi.fn(() => ({
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'test-id' }),
      findOne: vi.fn().mockResolvedValue({ test: true }),
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
    }))
  },
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(true),
  models: {}
};

export default mongoose;