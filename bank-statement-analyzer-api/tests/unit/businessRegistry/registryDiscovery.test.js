import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StateRegistryProfile from '../../../src/models/StateRegistryProfile.js';
import { processRegistryDiscoveryJob } from '../../../src/workers/registryDiscoveryBullProcessor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OH_PLAYBOOK = path.join(
  __dirname,
  '../../../src/services/businessRegistry/playbooks/OH.v1.json'
);

describe('registryDiscoveryBullProcessor', () => {
  beforeEach(() => {
    vi.spyOn(StateRegistryProfile, 'findOne').mockResolvedValue(null);
    vi.spyOn(StateRegistryProfile, 'create').mockImplementation(async (doc) => ({
      ...doc,
      playbooks: [],
      save: vi.fn().mockResolvedValue(true)
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads OH playbook from disk and creates LEARNING profile', async () => {
    expect(fs.existsSync(OH_PLAYBOOK)).toBe(true);

    const mockProfile = {
      stateCode: 'OH',
      playbooks: [],
      save: vi.fn().mockResolvedValue(true)
    };
    StateRegistryProfile.findOne.mockResolvedValue(null);
    StateRegistryProfile.create.mockResolvedValue(mockProfile);

    const result = await processRegistryDiscoveryJob({
      data: { stateCode: 'OH', businessName: 'Capri LLC', jobId: 'test-1' }
    });

    expect(result.stateCode).toBe('OH');
    expect(result.status).toBe('LEARNING');
    expect(mockProfile.playbooks.length).toBe(1);
    expect(mockProfile.playbooks[0].status).toBe('LEARNING');
    expect(mockProfile.playbooks[0].mapping.id).toBe('OH');
  });
});
