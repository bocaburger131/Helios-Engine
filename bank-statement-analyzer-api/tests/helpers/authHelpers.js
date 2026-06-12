import jwt from 'jsonwebtoken';

export function generateTestToken(userId = 'test-user-id', email = 'test@example.com') {
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1d' }
  );
}

export function getAuthHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user'
};