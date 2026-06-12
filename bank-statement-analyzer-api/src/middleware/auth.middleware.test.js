import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Set test environment
process.env.NODE_ENV = 'test';

// Import the actual middleware functions for testing
import { authenticateToken, authenticateUser, optionalAuth } from './auth.js';

// Mock jwt
vi.mock('jsonwebtoken');

describe('Auth Middleware', () => {
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
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset JWT mock
    jwt.verify.mockReset();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      mockReq.headers.authorization = 'Bearer valid-test-token';

      const mockUser = {
        id: '507f1f77bcf86cd799439011',
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      await authenticateToken(mockReq, mockRes, mockNext);
      expect(mockReq.user).toEqual({
        id: '507f1f77bcf86cd799439011',
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access token required',
        message: 'Please provide a valid authorization token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      
      // Mock callback-based JWT verify to simulate error
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(new Error('Invalid token'));
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed',
        message: 'Failed to authenticate token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should set user if valid token provided', async () => {
      mockReq.headers.authorization = 'Bearer valid-test-token';

      const mockUser = {
        id: '507f1f77bcf86cd799439011',
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual({
        id: '507f1f77bcf86cd799439011',
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user if no token provided', async () => {
      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeNull();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user if invalid token provided', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      
      // Mock callback-based JWT verify to simulate error
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(new Error('Invalid token'));
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeNull();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});