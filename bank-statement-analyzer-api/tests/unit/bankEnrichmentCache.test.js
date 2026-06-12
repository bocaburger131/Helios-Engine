import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import InstitutionalProfile from '../../src/models/InstitutionalProfile.js';
import { upsertInstitutionalProfile } from '../../src/services/bankEnrichmentService.js';

vi.mock('../../src/models/InstitutionalProfile.js', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn()
  }
}));

describe('upsertInstitutionalProfile request cache', () => {
  let readySpy;

  beforeEach(() => {
    vi.clearAllMocks();
    readySpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
  });

  afterEach(() => {
    readySpy.mockRestore();
  });

  it('skips second findOne when intent matches profileCache entry', async () => {
    const enriched = {
      routingNumber: '123456789',
      legalName: 'Mock National Bank',
      fdicCert: 'MOCK-6789',
      hqAddress: '',
      status: 'ACTIVE',
      website: '',
      logoUrl: '',
      socialLinks: { linkedin: '', twitter: '' }
    };
    InstitutionalProfile.findOne.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve(null)
      })
    }));
    InstitutionalProfile.findOneAndUpdate.mockResolvedValue({
      _id: 'profile1',
      legalName: 'WestStar Bank',
      routingNumber: '123456789'
    });

    const profileCache = new Map();
    const waterfallContext = {
      bankName: 'WestStar Bank',
      identityMethod: 'RTN_HARD_LOCK',
      sourceFile: 'stmt.pdf'
    };

    await upsertInstitutionalProfile(enriched, { profileCache, waterfallContext });
    await upsertInstitutionalProfile(enriched, { profileCache, waterfallContext });

    expect(InstitutionalProfile.findOne).toHaveBeenCalledTimes(1);
    expect(InstitutionalProfile.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
