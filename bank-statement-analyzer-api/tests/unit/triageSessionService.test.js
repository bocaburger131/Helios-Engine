import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  createUploadSessionId,
  saveTriageSession,
  loadTriageSession,
  TRIAGE_ROOT
} from '../../src/services/triageSessionService.js';

describe('triageSessionService', () => {
  let uploadSessionId;

  beforeEach(() => {
    uploadSessionId = createUploadSessionId();
  });

  afterEach(() => {
    const dir = path.join(TRIAGE_ROOT, uploadSessionId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates session id with triage prefix', () => {
    expect(uploadSessionId).toMatch(/^triage_/);
  });

  it('saves and loads staged files', () => {
    const buffer = Buffer.from('%PDF-1.4 fake');
    const files = [
      {
        originalname: 'stmt.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer
      }
    ];

    saveTriageSession(uploadSessionId, files, { dealId: 'DEMO-1' });
    const session = loadTriageSession(uploadSessionId);

    expect(session).not.toBeNull();
    expect(session.files).toHaveLength(1);
    expect(session.files[0].originalname).toBe('stmt.pdf');
    expect(session.manifest.meta.dealId).toBe('DEMO-1');
  });
});
