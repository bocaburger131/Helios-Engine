import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors.js';

// Mock user database
const mockUsers = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@example.com',
    password: '$2a$10$XrrVX.6Ki1znKHPa2E5GFe5hPmFmJI6vUZPxY8YGVK0EeRfqvvFvK', // admin123
    role: 'admin',
    isActive: true
  },
  {
    id: '2',
    username: 'testuser',
    email: 'test@example.com',
    password: '$2a$10$5d3MvVFmwJAi1N8nW3Ru8.NgyueVJk3eETc.0PlMmCVBM5PkQ3xDa', // test123
    role: 'user',
    isActive: true
  }
];

export const mockAuthService = {
  async findUserByCredentials(username) {
    return mockUsers.find(u => u.username === username || u.email === username);
  },

  async createUser(userData) {
    const newUser = {
      id: String(mockUsers.length + 1),
      ...userData,
      password: await bcrypt.hash(userData.password, 10),
      role: 'user',
      isActive: true
    };
    mockUsers.push(newUser);
    return newUser;
  },

  async findUserById(userId) {
    return mockUsers.find(u => u.id === userId);
  },

  generateToken(userId) {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }
};