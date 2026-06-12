import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Import the actual middleware functions for testing
import { authenticateToken } from './src/middleware/auth.middleware.js';

// Mock jwt
vi.mock('jsonwebtoken');

describe('Auth Debug Test', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: null
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  it('debug test - should authenticate valid token', () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    mockReq.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue(mockUser);

    console.log('Mock setup complete');
    console.log('Request headers:', mockReq.headers);
    console.log('JWT verify mock:', jwt.verify);
    console.log('Expected user:', mockUser);
    
    console.log('About to call authenticateToken...');
    authenticateToken(mockReq, mockRes, mockNext);
    console.log('Called authenticateToken');
    
    console.log('Final req.user:', mockReq.user);
    console.log('mockNext called times:', mockNext.mock.calls.length);
    console.log('mockRes.status called times:', mockRes.status.mock.calls.length);
    console.log('mockRes.json called times:', mockRes.json.mock.calls.length);

    if (mockRes.status.mock.calls.length > 0) {
      console.log('Status calls:', mockRes.status.mock.calls);
    }
    if (mockRes.json.mock.calls.length > 0) {
      console.log('JSON calls:', mockRes.json.mock.calls);
    }
  });
});
