import mongoose from 'mongoose';

/**
 * Normalizes input into a Mongoose ObjectId when possible.
 * @param {unknown} value
 * @returns {mongoose.Types.ObjectId | null}
 */
export function normalizeObjectId(value) {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  return null;
}

/**
 * Builds a query fragment that matches statements stored with legacy `userId`
 * or the current `user` field.
 * @param {unknown} userId
 * @returns {{ $or: Array<Record<string, unknown>> } | null}
 */
export function buildUserOwnershipQuery(userId) {
  if (userId === undefined || userId === null) {
    return null;
  }

  const normalized = normalizeObjectId(userId);
  const value = normalized ?? userId;

  return {
    $or: [
      { user: value },
      { userId: value }
    ]
  };
}

/**
 * Extracts the owning user identifier from a document, handling both `user`
 * and legacy `userId` fields.
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {string | null}
 */
export function getDocumentUserId(doc) {
  if (!doc) {
    return null;
  }

  const raw = doc.user ?? doc.userId;
  if (!raw) {
    return null;
  }

  const normalized = normalizeObjectId(raw);
  if (normalized) {
    return normalized.toString();
  }

  if (typeof raw === 'string') {
    return raw;
  }

  return null;
}
