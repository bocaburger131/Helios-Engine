import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstitutionalProfile from '../../src/models/InstitutionalProfile.js';
import { processTemplateOutcome } from '../../src/services/templateGraduationService.js';

vi.mock('../../src/models/InstitutionalProfile.js', () => ({
  default: {
    findOne: vi.fn()
  }
}));

describe('Regions template graduation (Premier Fitness RTN 062000019)', () => {
  const RTN = '062000019';
  let templateDoc;

  beforeEach(() => {
    templateDoc = {
      routingNumber: RTN,
      legalName: 'Regions Bank',
      templates: [
        {
          version: 1,
          status: 'LEARNING',
          consecutiveSuccesses: 0,
          totalProcessed: 0,
          mapping: {}
        }
      ],
      markModified: vi.fn(),
      save: vi.fn(async function save() {
        return this;
      })
    };
    InstitutionalProfile.findOne.mockResolvedValue(templateDoc);
  });

  it('promotes to VERIFIED after 5 consecutive checksum successes', async () => {
    let lastResult = null;
    for (let i = 1; i <= 5; i += 1) {
      lastResult = await processTemplateOutcome(RTN, 1, true);
      expect(lastResult.consecutiveSuccesses).toBe(i);
    }
    expect(templateDoc.templates[0].status).toBe('VERIFIED');
    expect(lastResult.status).toBe('VERIFIED');
    expect(templateDoc.save).toHaveBeenCalledTimes(5);
  });

  it('resets streak on reconciliation failure', async () => {
    await processTemplateOutcome(RTN, 1, true);
    await processTemplateOutcome(RTN, 1, true);
    await processTemplateOutcome(RTN, 1, false, { lastError: 'checksum mismatch' });
    expect(templateDoc.templates[0].consecutiveSuccesses).toBe(0);
    expect(templateDoc.templates[0].status).toBe('FAILED');
  });
});
