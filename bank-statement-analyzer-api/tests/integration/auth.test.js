import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock the User model BEFORE importing anything that depends on it
vi.mock('../../src/models/User.js', () => ({
  default: {
    findOne: vi.fn(() => ({
      select: vi.fn()
    })),
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    findById: vi.fn()
  }
}));

// Mock the logger to avoid issues
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock AppError class
vi.mock('../../src/utils/errors.js', () => ({
  AppError: class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.status = statusCode;
    }
  }
}));

// Now import everything after mocking
import User from '../../src/models/User.js';
import authController from '../../src/controllers/authController.js';
import express from 'express';
import request from 'supertest';

// Create a minimal test app
const app = express();
app.use(express.json());

app.post('/api/auth/login', (req, res, next) => {
  authController.login(req, res, next);
});

// Add error handling middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should login with valid credentials', async () => {
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);
    
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
      isEmailVerified: true
    };

    // Mock User.findOne().select() chain
    const mockSelect = vi.fn().mockResolvedValue(mockUser);
    User.findOne = vi.fn().mockReturnValue({ select: mockSelect });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('token');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user.email).toBe('test@example.com');
  });

  it('should not login with invalid credentials', async () => {
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);
    
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
      isEmailVerified: true
    };

    // Mock User.findOne().select() chain for invalid password test
    const mockSelect = vi.fn().mockResolvedValue(mockUser);
    User.findOne = vi.fn().mockReturnValue({ select: mockSelect });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'WrongPassword' // This will fail bcrypt.compare()
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('error');
  });
});