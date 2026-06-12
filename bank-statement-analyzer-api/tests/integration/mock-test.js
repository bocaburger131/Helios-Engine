import { describe, it, expect, vi } from 'vitest';

// Mock the User model BEFORE importing anything that depends on it
vi.mock('../../src/models/User.js', () => ({
  default: {
    findOne: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        _id: '123',
        email: 'test@example.com',
        password: 'hashedpassword'
      })
    }))
  }
}));

// Import the User model after mocking
import User from '../../src/models/User.js';

describe('Mock Test', () => {
  it('should use mocked User model', async () => {
    console.log('User in mock test:', User);
    
    const result = await User.findOne({ email: 'test@example.com' }).select('+password');
    console.log('Result:', result);
    
    expect(result).toHaveProperty('_id', '123');
    expect(result).toHaveProperty('email', 'test@example.com');
  });
});
