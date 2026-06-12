import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('mongoUri', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.MONGO_URI;
    delete process.env.MONGODB_URI;
  });

  afterEach(() => {
    process.env.MONGO_URI = envBackup.MONGO_URI;
    process.env.MONGODB_URI = envBackup.MONGODB_URI;
  });

  it('prefers MONGO_URI over MONGODB_URI', async () => {
    process.env.MONGO_URI = 'mongodb://atlas.example/test';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/other';
    const { getMongoUri, getMongoUriSource } = await import('../../src/config/mongoUri.js');
    expect(getMongoUri()).toBe('mongodb://atlas.example/test');
    expect(getMongoUriSource()).toBe('MONGO_URI');
  });

  it('falls back to MONGODB_URI then config default', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/from-env';
    const { getMongoUri, getMongoUriSource } = await import('../../src/config/mongoUri.js');
    expect(getMongoUri()).toBe('mongodb://localhost:27017/from-env');
    expect(getMongoUriSource()).toBe('MONGODB_URI');
  });
});
