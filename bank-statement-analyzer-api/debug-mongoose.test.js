// Debug test for mongoose mock
import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

describe('Mongoose Mock Debug', () => {
  it('should have proper Schema.Types', () => {
    console.log('mongoose:', mongoose);
    console.log('mongoose.Schema:', mongoose.Schema);
    console.log('mongoose.Schema.prototype:', mongoose.Schema.prototype);
    console.log('mongoose.Schema constructor:', mongoose.Schema.constructor);
    
    // Try to access Types in different ways
    console.log('mongoose.Schema.Types:', mongoose.Schema.Types);
    console.log('mongoose.Schema.prototype.Types:', mongoose.Schema.prototype.Types);
    
    // Check if Schema has any properties at all
    console.log('Schema properties:', Object.getOwnPropertyNames(mongoose.Schema));
    console.log('Schema descriptor for Types:', Object.getOwnPropertyDescriptor(mongoose.Schema, 'Types'));
    
    expect(mongoose).toBeDefined();
    expect(mongoose.Schema).toBeDefined();
  });
});
