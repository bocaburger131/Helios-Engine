import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockComparePassword = vi.fn();
const mockSave = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/models/User.js', () => ({
  default: {
    findOne: vi.fn()
  }
}));

vi.mock('../../src/middleware/validation.js', () => ({
  validateRequest: (_req, _res, next) => next()
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

import User from '../../src/models/User.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  return import('../../src/routes/authRoutes.js').then(({ default: authRoutes }) => {
    app.use('/api/auth', authRoutes);
    return app;
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-auth-routes-secret';
  });

  it('returns 401 when user not found', async () => {
    User.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null)
    });
    const app = await buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 403 when account is inactive', async () => {
    User.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        isActive: false,
        comparePassword: mockComparePassword
      })
    });
    const app = await buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@example.com', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/inactive/i);
  });

  it('returns 200 with JWT for valid credentials', async () => {
    const user = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      email: 'admin@shift4funding.com',
      role: 'ADMIN',
      name: 'Helios Admin',
      isActive: true,
      loginAttempts: 0,
      lockUntil: undefined,
      comparePassword: mockComparePassword.mockResolvedValue(true),
      save: mockSave
    };
    User.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(user)
    });

    const app = await buildApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@shift4funding.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.data.token).toBe(res.body.token);

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.id).toBe('507f1f77bcf86cd799439011');
    expect(decoded.role).toBe('ADMIN');
    expect(decoded.email).toBe('admin@shift4funding.com');
  });

  it('register returns 501 when disabled', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('REGISTRATION_DISABLED');
  });
});
