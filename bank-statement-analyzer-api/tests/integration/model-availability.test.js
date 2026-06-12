import { describe, it, expect, beforeEach, vi } from 'vitest';

// Simple test to verify global models are available
describe('Model Availability Test', () => {
  it('should have global User model available', () => {
    expect(global.User).toBeDefined();
    expect(typeof global.User.create).toBe('function');
    expect(typeof global.User.findOne).toBe('function');
    console.log('✅ Global User model is properly defined');
  });

  it('should have global Statement model available', () => {
    expect(global.Statement).toBeDefined();
    expect(typeof global.Statement.create).toBe('function');
    expect(typeof global.Statement.find).toBe('function');
    console.log('✅ Global Statement model is properly defined');
  });

  it('should create User instances correctly', async () => {
    const userData = { email: 'test@example.com', name: 'Test User' };
    const user = await global.User.create(userData);
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    console.log('✅ User creation works correctly');
  });

  it('should create Statement instances correctly', async () => {
    const statementData = { 
      userId: '507f1f77bcf86cd799439011', 
      filename: 'test.pdf',
      bankName: 'Test Bank'
    };
    const statement = await global.Statement.create(statementData);
    
    expect(statement).toBeDefined();
    expect(statement.userId).toBe('507f1f77bcf86cd799439011');
    expect(statement.filename).toBe('test.pdf');
    console.log('✅ Statement creation works correctly');
  });
});
