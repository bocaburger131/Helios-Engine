// test-mock-fixes.js - Verify mockResolvedValue and rmSync fixes
import { describe, it, expect, vi } from 'vitest';

describe('Mock Fixes Verification', () => {
  
  it('✅ User model should have working mockResolvedValue', async () => {
    expect(global.User).toBeDefined();
    expect(global.User.findOne).toBeDefined();
    expect(global.User.findOne.mockResolvedValue).toBeDefined();
    
    // Test that mockResolvedValue works
    global.User.findOne.mockResolvedValue({ email: 'test@example.com' });
    const user = await global.User.findOne({ email: 'test@example.com' });
    expect(user).toEqual({ email: 'test@example.com' });
  });
  
  it('✅ Statement model should have working mockResolvedValue', async () => {
    expect(global.Statement).toBeDefined();
    expect(global.Statement.create).toBeDefined();
    expect(global.Statement.create.mockResolvedValue).toBeDefined();
    
    // Test functionality
    const mockStatement = { _id: 'test-id', filename: 'test.pdf' };
    global.Statement.create.mockResolvedValue(mockStatement);
    const statement = await global.Statement.create({ filename: 'test.pdf' });
    expect(statement).toEqual(mockStatement);
  });
  
  it('✅ fs should have rmSync method that works', async () => {
    const fs = await import('fs');
    
    expect(fs.default.rmSync).toBeDefined();
    expect(typeof fs.default.rmSync).toBe('function');
    
    // Test that rmSync doesn't throw
    expect(() => {
      fs.default.rmSync('/tmp/test-directory', { recursive: true, force: true });
    }).not.toThrow();
    
    // Verify it was called
    expect(fs.default.rmSync).toHaveBeenCalledWith('/tmp/test-directory', { recursive: true, force: true });
  });
  
  it('✅ All model methods should have mockResolvedValue', () => {
    const methodsToCheck = ['create', 'findOne', 'findById', 'find', 'updateOne', 'deleteOne'];
    
    for (const method of methodsToCheck) {
      expect(global.User[method]).toBeDefined();
      expect(global.User[method].mockResolvedValue).toBeDefined();
      expect(global.Statement[method]).toBeDefined();
      expect(global.Statement[method].mockResolvedValue).toBeDefined();
    }
  });
  
});

console.log('✅ Mock verification test created - run this to confirm fixes work');
