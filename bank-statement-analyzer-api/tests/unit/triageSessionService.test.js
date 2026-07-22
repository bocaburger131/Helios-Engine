import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.unmock('fs');

import fs from 'fs';
import path from 'path';
import {
  createUploadSessionId,
  createSessionAccessToken,
  saveTriageSession,
  loadTriageSession,
  assertTriageSessionAccess,
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

  it('denies cross-user triage access without token', () => {
    const buffer = Buffer.from('%PDF-1.4 fake');
    const token = createSessionAccessToken();
    saveTriageSession(uploadSessionId, [
      { originalname: 'stmt.pdf', mimetype: 'application/pdf', size: buffer.length, buffer }
    ], {
      ownerUserId: 'user-a',
      sessionAccessToken: token
    });
    const session = loadTriageSession(uploadSessionId);
    const denied = assertTriageSessionAccess({ user: { id: 'user-b' }, body: {}, headers: {} }, session);
    expect(denied.ok).toBe(false);
    const allowed = assertTriageSessionAccess(
      { user: { id: 'user-b' }, body: {}, headers: { 'x-triage-access-token': token } },
      session
    );
    expect(allowed.ok).toBe(true);
  });

  it('requires access token for public-submit sessions', () => {
    const buffer = Buffer.from('%PDF-1.4 fake');
    const token = createSessionAccessToken();
    saveTriageSession(uploadSessionId, [
      { originalname: 'stmt.pdf', mimetype: 'application/pdf', size: buffer.length, buffer }
    ], {
      ownerUserId: 'public-submit',
      sessionAccessToken: token
    });
    const session = loadTriageSession(uploadSessionId);
    const denied = assertTriageSessionAccess(
      { user: { id: 'public-submit' }, body: {}, headers: {} },
      session
    );
    expect(denied.ok).toBe(false);
    const allowed = assertTriageSessionAccess(
      { user: { id: 'public-submit' }, body: { triageAccessToken: token } },
      session
    );
    expect(allowed.ok).toBe(true);
  });
});
