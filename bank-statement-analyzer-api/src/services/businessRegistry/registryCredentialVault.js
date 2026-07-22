/**
 * Encrypted per-user state registry portal credentials.
 */

import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';

const credentialSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true, index: true },
    stateCode: { type: String, required: true, trim: true, uppercase: true },
    encryptedPayload: { type: String, required: true },
    creditsRemaining: { type: Number, default: null },
    lastUsedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

credentialSchema.index({ userId: 1, stateCode: 1 }, { unique: true });

const StateRegistryCredential =
  mongoose.models.StateRegistryCredential ||
  mongoose.model('StateRegistryCredential', credentialSchema);

function getEncryptionKey() {
  const key = process.env.REGISTRY_CREDENTIALS_KEY || process.env.JWT_SECRET || 'dev-registry-key-change-me';
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * @param {object} payload
 * @returns {string}
 */
export function encryptPayload(payload) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * @param {string} encrypted
 * @returns {object|null}
 */
export function decryptPayload(encrypted) {
  try {
    const [ivHex, dataHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} userId
 * @param {string} stateCode
 * @param {object} credentials
 */
export async function saveRegistryCredentials(userId, stateCode, credentials) {
  const encryptedPayload = encryptPayload(credentials);
  return StateRegistryCredential.findOneAndUpdate(
    { userId, stateCode: stateCode.toUpperCase() },
    { encryptedPayload, lastUsedAt: new Date() },
    { upsert: true, new: true }
  );
}

/**
 * @param {string} userId
 * @param {string} stateCode
 */
export async function getRegistryCredentials(userId, stateCode) {
  const doc = await StateRegistryCredential.findOne({
    userId,
    stateCode: stateCode.toUpperCase()
  });
  if (!doc) return null;
  return decryptPayload(doc.encryptedPayload);
}

export default StateRegistryCredential;
