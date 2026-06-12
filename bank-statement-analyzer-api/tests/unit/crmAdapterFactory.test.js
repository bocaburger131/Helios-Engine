import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const writeFileMock = vi.fn(async () => {});

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => {}),
    writeFile: writeFileMock
  }
}));

describe('crmAdapterFactory', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ACTIVE_CRM;
    delete process.env.ENABLE_CRM_INTEGRATION;
  });

  afterEach(() => {
    delete process.env.ACTIVE_CRM;
    delete process.env.ENABLE_CRM_INTEGRATION;
  });

  it('defaults to zoho adapter', async () => {
    const { getCrmAdapter, resetCrmAdapterCache } = await import(
      '../../src/services/crm/crmAdapterFactory.js'
    );
    resetCrmAdapterCache();
    process.env.DISABLE_ZOHO = 'true';
    const adapter = getCrmAdapter();
    expect(adapter.providerId).toBe('zoho');
    delete process.env.DISABLE_ZOHO;
  });

  it('routes to salesforce when ACTIVE_CRM=salesforce', async () => {
    const { getCrmAdapter, resetCrmAdapterCache } = await import(
      '../../src/services/crm/crmAdapterFactory.js'
    );
    resetCrmAdapterCache();
    process.env.ACTIVE_CRM = 'salesforce';
    const adapter = getCrmAdapter({ forceNew: true });
    expect(adapter.providerId).toBe('salesforce');
  });

  it('isCrmIntegrationEnabled reads env flag', async () => {
    const { isCrmIntegrationEnabled } = await import(
      '../../src/services/crm/crmAdapterFactory.js'
    );
    expect(isCrmIntegrationEnabled()).toBe(false);
    process.env.ENABLE_CRM_INTEGRATION = 'true';
    expect(isCrmIntegrationEnabled()).toBe(true);
  });
});

describe('ZohoAdapter.fetchDealDocuments', () => {
  beforeEach(() => {
    writeFileMock.mockClear();
    vi.resetModules();
    process.env.DISABLE_ZOHO = 'true';
    process.env.CRM_WRITE_ATTACHMENTS_TO_DISK = 'false';
  });

  afterEach(() => {
    delete process.env.DISABLE_ZOHO;
    delete process.env.CRM_WRITE_ATTACHMENTS_TO_DISK;
  });

  it('fetchAttachmentsAsBuffers does not write to disk when flag is false', async () => {
    const { ZohoCrmService } = await import('../../src/services/crm/zoho.service.js');
    const service = new ZohoCrmService();
    service.disabled = false;
    service.getDealAttachments = vi.fn(async () => []);
    service.workDriveService = null;

    await service.fetchAttachmentsAsBuffers('deal-1');
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('normalizeZohoDeal', () => {
  it('maps Zoho deal fields', async () => {
    const { normalizeZohoDeal } = await import('../../src/services/crm/zohoAdapter.js');
    const normalized = normalizeZohoDeal(
      {
        id: '999',
        Deal_Name: 'Test Deal',
        Amount: 50000,
        Tax_ID: '12-3456789',
        Annual_Revenue: 300000,
        Email: 'a@b.com'
      },
      '999'
    );
    expect(normalized.dealId).toBe('999');
    expect(normalized.legalName).toBe('Test Deal');
    expect(normalized.requestedAmount).toBe(50000);
    expect(normalized.email).toBe('a@b.com');
  });
});
