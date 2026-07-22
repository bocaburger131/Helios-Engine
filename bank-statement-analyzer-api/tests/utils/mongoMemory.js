import { MongoMemoryServer } from 'mongodb-memory-server';

const PINNED_MONGO_VERSION = '7.0.14';

/**
 * Create MongoMemoryServer with a pinned binary version.
 * Clears MONGOMS_DOWNLOAD_URL from .env — "mongodb-windows-x86_64" URLs break parseArchiveNameRegex.
 */
export async function createTestMongoServer() {
  const keysToClear = [
    'MONGOMS_DOWNLOAD_URL',
    'MONGOMS_ARCHIVE_NAME',
    'MONGOMS_DOWNLOAD_MIRROR'
  ];
  const saved = {};
  for (const key of keysToClear) {
    if (process.env[key] !== undefined) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  }

  const rawVersion = process.env.MONGOMS_VERSION;
  if (rawVersion && !/^\d+\.\d+(\.\d+)?/.test(String(rawVersion).trim())) {
    saved.MONGOMS_VERSION = rawVersion;
    delete process.env.MONGOMS_VERSION;
  }

  try {
    return await MongoMemoryServer.create({
      binary: { version: PINNED_MONGO_VERSION }
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      process.env[key] = value;
    }
  }
}
