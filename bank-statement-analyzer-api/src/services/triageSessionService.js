import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const TRIAGE_ROOT = path.join(process.cwd(), 'uploads', 'triage');
export const SESSION_TTL_MS = 60 * 60 * 1000;

export function createUploadSessionId() {
  return `triage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function sessionDir(uploadSessionId) {
  const safe = String(uploadSessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(TRIAGE_ROOT, safe);
}

export function saveTriageSession(uploadSessionId, files, meta = {}) {
  const dir = sessionDir(uploadSessionId);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    uploadSessionId,
    files: [],
    meta,
    createdAt: Date.now()
  };

  for (const file of files) {
    const safeName = path.basename(file.originalname || 'file.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(dir, safeName);
    const buffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
    if (!buffer) continue;
    fs.writeFileSync(destPath, buffer);
    manifest.files.push({
      originalName: file.originalname,
      storedName: safeName,
      mimetype: file.mimetype || 'application/pdf',
      size: file.size || buffer.length
    });
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Merge fields into manifest.meta (e.g. extractedAnchorData after triage extraction).
 */
export function updateTriageSessionMeta(uploadSessionId, metaPatch = {}) {
  const dir = sessionDir(uploadSessionId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.meta = { ...(manifest.meta || {}), ...metaPatch };
  manifest.updatedAt = Date.now();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Persist user-confirmed bank identity for a file (survives batch re-runs via uploadSessionId).
 * @param {string} uploadSessionId
 * @param {{ fileName: string, bankName: string, bankId?: string|null }} entry
 */
export function saveConfirmedBankForSession(uploadSessionId, { fileName, bankName, bankId = null }) {
  if (!uploadSessionId || !fileName || !bankName) return null;
  const dir = sessionDir(uploadSessionId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const confirmedBanks = { ...(manifest.meta?.confirmedBanks || {}) };
  confirmedBanks[fileName] = {
    bankName,
    bankId: bankId || null,
    confirmedAt: Date.now()
  };
  manifest.meta = { ...(manifest.meta || {}), confirmedBanks };
  manifest.updatedAt = Date.now();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return confirmedBanks[fileName];
}

/**
 * @param {string} uploadSessionId
 * @param {string} fileOriginalName
 * @returns {{ bankName: string, bankId?: string|null, confirmedAt?: number }|null}
 */
export function getConfirmedBankForFile(uploadSessionId, fileOriginalName) {
  const session = loadTriageSession(uploadSessionId);
  if (!session?.manifest?.meta?.confirmedBanks) return null;
  return session.manifest.meta.confirmedBanks[fileOriginalName] || null;
}

/**
 * Verify caller may access a triage session (owner user id or session access token).
 * @param {import('express').Request} req
 * @param {{ manifest?: { meta?: Record<string, unknown> } }|null} session
 */
export function assertTriageSessionAccess(req, session) {
  if (!session?.manifest) {
    return { ok: false, status: 404, error: 'Upload session expired or not found' };
  }

  const meta = session.manifest.meta || {};
  const requestUserId = String(req.user?.id ?? 'anonymous');
  const accessToken = String(
    req.headers?.['x-triage-access-token'] ?? req.body?.triageAccessToken ?? ''
  ).trim();
  const publicOwnerIds = new Set(['public-submit', 'anonymous']);

  if (meta.sessionAccessToken && accessToken === meta.sessionAccessToken) {
    return { ok: true };
  }
  if (meta.ownerUserId && !publicOwnerIds.has(String(meta.ownerUserId))) {
    if (requestUserId === String(meta.ownerUserId)) {
      return { ok: true };
    }
    return { ok: false, status: 403, error: 'Triage session access denied' };
  }
  if (meta.ownerUserId && publicOwnerIds.has(String(meta.ownerUserId))) {
    return { ok: false, status: 403, error: 'Triage session access denied' };
  }
  if (!meta.ownerUserId && !meta.sessionAccessToken) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: 'Triage session access denied' };
}

export function createSessionAccessToken() {
  return crypto.randomBytes(16).toString('hex');
}

export function loadTriageSession(uploadSessionId) {
  const dir = sessionDir(uploadSessionId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (Date.now() - (manifest.createdAt || 0) > SESSION_TTL_MS) {
    return null;
  }

  // Lazy file handles: sessions can hold hundreds of MB of PDFs, and most
  // callers (access checks, enqueue, manifest reads) never touch the bytes.
  const files = (manifest.files || []).map((f) => {
    const filePath = path.join(dir, f.storedName);
    const readBuffer = () => fs.readFileSync(filePath);
    return {
      originalname: f.originalName,
      mimetype: f.mimetype,
      size: f.size,
      path: filePath,
      readBuffer,
      // Compatibility with multer-shaped consumers; reads on demand, caches nothing.
      get buffer() {
        return readBuffer();
      }
    };
  });

  return { manifest, files, dir };
}

export default {
  createUploadSessionId,
  createSessionAccessToken,
  saveTriageSession,
  updateTriageSessionMeta,
  saveConfirmedBankForSession,
  getConfirmedBankForFile,
  loadTriageSession,
  assertTriageSessionAccess,
  TRIAGE_ROOT,
  SESSION_TTL_MS
};
