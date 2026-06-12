import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldTriggerVera,
  createVeraPdfToken,
  verifyVeraPdfToken
} from '../../src/services/veraVerificationService.js';

describe('veraVerificationService', () => {
  beforeEach(() => {
    process.env.VERA_PDF_SIGNING_SECRET = 'test-vera-secret';
  });

  it('shouldTriggerVera is true when checksum fails', () => {
    expect(shouldTriggerVera({ checksumRecon: { ok: false }, geminiConfidence: null })).toBe(true);
  });

  it('shouldTriggerVera is true when confidence below 0.8', () => {
    expect(shouldTriggerVera({ checksumRecon: { ok: true }, geminiConfidence: 0.5 })).toBe(true);
  });

  it('shouldTriggerVera is false when checksum ok and confidence unknown', () => {
    expect(shouldTriggerVera({ checksumRecon: { ok: true }, geminiConfidence: null })).toBe(false);
  });

  it('verifyVeraPdfToken accepts valid token', () => {
    const sid = '507f1f77bcf86cd799439011';
    const uid = '507f191e810c19729de860ea';
    const tok = createVeraPdfToken(sid, uid);
    const v = verifyVeraPdfToken(tok);
    expect(v.ok).toBe(true);
    expect(v.statementId).toBe(sid);
    expect(v.userId).toBe(uid);
  });

  it('verifyVeraPdfToken rejects tampered token', () => {
    const tok = createVeraPdfToken('507f1f77bcf86cd799439011', '507f191e810c19729de860ea');
    const v = verifyVeraPdfToken(tok.slice(0, -4) + 'xxxx');
    expect(v.ok).toBe(false);
  });
});
