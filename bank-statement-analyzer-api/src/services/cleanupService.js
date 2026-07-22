import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import { TRIAGE_ROOT, SESSION_TTL_MS } from './triageSessionService.js';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 24 * HOUR_MS;

/**
 * Disk hygiene for uploads/: multer originals older than maxAge are deleted, and
 * uploads/triage/<session>/ directories are removed once past SESSION_TTL_MS.
 * Enabled by default; set CLEANUP_ENABLED=false to opt out.
 */
class CleanupService {
  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.maxAge = Number(process.env.CLEANUP_MAX_AGE_MS) > 0
      ? Number(process.env.CLEANUP_MAX_AGE_MS)
      : DEFAULT_MAX_AGE_MS;
    this.intervalMs = HOUR_MS;
    this.timer = null;
  }

  isEnabled() {
    return String(process.env.CLEANUP_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  start() {
    if (!this.isEnabled()) {
      logger.info('[CLEANUP] Disabled via CLEANUP_ENABLED=false');
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => logger.error('[CLEANUP] Sweep failed:', err));
    }, this.intervalMs);
    this.timer.unref?.();
    // Initial sweep at boot so restarts also reclaim disk.
    this.runOnce().catch((err) => logger.error('[CLEANUP] Initial sweep failed:', err));
    logger.info(
      `[CLEANUP] Started (uploads max age ${Math.round(this.maxAge / HOUR_MS)}h, triage TTL ${Math.round(SESSION_TTL_MS / 60000)}m, every ${Math.round(this.intervalMs / 60000)}m)`
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce() {
    await this.cleanupOldFiles();
    await this.cleanupTriageSessions();
  }

  /** Delete stale multer originals directly under uploads/ (subdirectories are skipped). */
  async cleanupOldFiles() {
    let entries;
    try {
      entries = await fs.readdir(this.uploadsDir, { withFileTypes: true });
    } catch {
      return; // uploads/ not created yet
    }

    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(this.uploadsDir, entry.name);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > this.maxAge) {
          await fs.unlink(filePath);
          logger.info(`[CLEANUP] Removed stale upload: ${entry.name}`);
        }
      } catch (err) {
        logger.warn(`[CLEANUP] Could not remove ${entry.name}: ${err.message}`);
      }
    }
  }

  /** Remove triage session directories whose manifest (or dir) is past SESSION_TTL_MS. */
  async cleanupTriageSessions() {
    let entries;
    try {
      entries = await fs.readdir(TRIAGE_ROOT, { withFileTypes: true });
    } catch {
      return; // triage root not created yet
    }

    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(TRIAGE_ROOT, entry.name);
      try {
        let createdAt = null;
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
          createdAt = Number(manifest.createdAt) || null;
        } catch {
          /* no manifest — fall back to dir mtime */
        }
        if (createdAt == null) {
          createdAt = (await fs.stat(dir)).mtimeMs;
        }
        if (now - createdAt > SESSION_TTL_MS) {
          await fs.rm(dir, { recursive: true, force: true });
          logger.info(`[CLEANUP] Removed expired triage session: ${entry.name}`);
        }
      } catch (err) {
        logger.warn(`[CLEANUP] Could not remove triage session ${entry.name}: ${err.message}`);
      }
    }
  }
}

export default new CleanupService();
