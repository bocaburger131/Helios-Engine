/**
 * File-backed status for async macro batch jobs (survives in-process background runs).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import fs from 'fs';
import path from 'path';

export const MACRO_JOB_ROOT = path.join(process.cwd(), 'uploads', 'macro-jobs');
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function jobPath(jobId) {
  const safe = String(jobId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(MACRO_JOB_ROOT, `${safe}.json`);
}

function ensureRoot() {
  fs.mkdirSync(MACRO_JOB_ROOT, { recursive: true });
}

/**
 * @param {string} jobId
 * @param {Record<string, unknown>} payload
 */
export function writeMacroBatchJob(jobId, payload) {
  ensureRoot();
  const existing = readMacroBatchJob(jobId) || {};
  const next = {
    jobId,
    ...existing,
    ...payload,
    updatedAt: Date.now()
  };
  fs.writeFileSync(jobPath(jobId), JSON.stringify(next, null, 2));
  return next;
}

/**
 * @param {string} jobId
 * @returns {Record<string, unknown>|null}
 */
export function readMacroBatchJob(jobId) {
  const file = jobPath(jobId);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - (data.updatedAt || data.startedAt || 0) > JOB_TTL_MS) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function completeMacroBatchJob(jobId, envelope) {
  return writeMacroBatchJob(jobId, {
    status: 'completed',
    result: envelope,
    completedAt: Date.now()
  });
}

export async function failMacroBatchJob(jobId, err) {
  return writeMacroBatchJob(jobId, {
    status: 'failed',
    error: err?.message || String(err),
    failedAt: Date.now()
  });
}

export default {
  writeMacroBatchJob,
  readMacroBatchJob,
  completeMacroBatchJob,
  failMacroBatchJob,
  MACRO_JOB_ROOT
};
