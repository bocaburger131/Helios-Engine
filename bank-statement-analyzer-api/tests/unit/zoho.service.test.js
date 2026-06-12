import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';

const postMock = vi.fn();
const getMock = vi.fn();
const mockAxiosInstance = {
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() }
  },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
};
const createMock = vi.fn(() => mockAxiosInstance);

vi.mock('axios', () => ({
  default: {
    post: postMock,
    get: getMock,
    create: createMock
  }
}));

const mkdirMock = vi.fn(async () => {});
const writeFileMock = vi.fn(async () => {});

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mkdirMock,
    writeFile: writeFileMock
  }
}));

let ZohoCrmService;

describe('ZohoCrmService.getAttachmentsForDeal', () => {
  beforeEach(async () => {
    vi.resetModules();
    postMock.mockClear();
    getMock.mockClear();
    createMock.mockClear();
    mkdirMock.mockClear();
    writeFileMock.mockClear();
    mockAxiosInstance.get.mockClear();
    mockAxiosInstance.post.mockClear();
    mockAxiosInstance.interceptors.request.use.mockClear();

    process.env.ZOHO_CLIENT_ID = 'client-id';
    process.env.ZOHO_CLIENT_SECRET = 'client-secret';
    process.env.ZOHO_REFRESH_TOKEN = 'refresh-token';
    process.env.ZOHO_API_DOMAIN = 'https://www.zohoapis.com';
    process.env.ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
    // Ensure the Zoho service is NOT disabled for unit tests
    process.env.DISABLE_ZOHO = 'false';

    ({ default: ZohoCrmService } = await import('../../src/services/crm/zoho.service.js'));
  });

  afterEach(() => {
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_CLIENT_SECRET;
    delete process.env.ZOHO_REFRESH_TOKEN;
    delete process.env.ZOHO_API_DOMAIN;
    delete process.env.ZOHO_ACCOUNTS_URL;
    delete process.env.DISABLE_ZOHO;
  });

  it('downloads attachments and returns local file paths', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        access_token: 'access-token',
        expires_in: 3600
      }
    });

    const service = new ZohoCrmService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token'
    });

    mockAxiosInstance.get
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'att-1',
              File_Name: 'statement1.pdf',
              $download_url: '/crm/v2/Deals/deal-123/Attachments/att-1',
              Size: '1024'
            },
            {
              id: 'att-2',
              File_Name: 'statement2.pdf',
              Size: '2048'
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: Buffer.from('file-1') })
      .mockResolvedValueOnce({ data: Buffer.from('file-2') });

    const files = await service.getAttachmentsForDeal('deal-123');

    expect(postMock).toHaveBeenCalledWith(
      'https://accounts.zoho.com/oauth/v2/token',
      expect.any(String),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    );

    expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/Deals/deal-123/Attachments');
    expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/Deals/deal-123/Attachments/att-1', expect.objectContaining({ responseType: 'arraybuffer' }));
    expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(3, '/Deals/deal-123/Attachments/att-2', expect.objectContaining({ responseType: 'arraybuffer' }));

    expect(mkdirMock).toHaveBeenCalledWith(path.join(process.cwd(), 'tmp', 'uploads'), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual(expect.objectContaining({
      id: 'att-1',
      fileName: 'statement1.pdf',
      filePath: expect.stringContaining(path.join('tmp', 'uploads', 'statement1.pdf'))
    }));
  });

  it('returns empty array when no attachments found', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        access_token: 'access-token',
        expires_in: 3600
      }
    });

    const service = new ZohoCrmService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token'
    });

    mockAxiosInstance.get.mockResolvedValueOnce({ data: { data: [] } });

    const files = await service.getAttachmentsForDeal('deal-empty');

    expect(files).toEqual([]);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('ZohoCrmService.getDealAttachments', () => {
  beforeEach(async () => {
    vi.resetModules();
    postMock.mockClear();
    getMock.mockClear();
    createMock.mockClear();
    mkdirMock.mockClear();
    writeFileMock.mockClear();
    mockAxiosInstance.get.mockClear();
    mockAxiosInstance.post.mockClear();
    mockAxiosInstance.interceptors.request.use.mockClear();

    process.env.ZOHO_CLIENT_ID = 'client-id';
    process.env.ZOHO_CLIENT_SECRET = 'client-secret';
    process.env.ZOHO_REFRESH_TOKEN = 'refresh-token';
    process.env.ZOHO_API_DOMAIN = 'https://www.zohoapis.com';
    process.env.ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
    // Ensure the Zoho service is NOT disabled for unit tests
    process.env.DISABLE_ZOHO = 'false';

    ({ default: ZohoCrmService } = await import('../../src/services/crm/zoho.service.js'));
  });

  afterEach(() => {
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_CLIENT_SECRET;
    delete process.env.ZOHO_REFRESH_TOKEN;
    delete process.env.ZOHO_API_DOMAIN;
    delete process.env.ZOHO_ACCOUNTS_URL;
    delete process.env.DISABLE_ZOHO;
  });

  it('fetches attachments and sets authorization header with refreshed token', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        access_token: 'access-token',
        scope: 'crm.read crm.write crm.attach.READ workdrive.files.READ',
        expires_in: 3600
      }
    });

    const service = new ZohoCrmService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token'
    });

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'att-1', File_Name: 'statement.pdf', Size: '2048' }
        ]
      }
    });

    const attachments = await service.getDealAttachments('deal-123');

    // Verify the service retrieved attachments successfully
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/Deals/deal-123/Attachments');
    
    // Verify the request interceptor was registered (which sets the auth header)
    expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

    // Verify attachments were returned correctly
    expect(attachments).toEqual([
      { id: 'att-1', File_Name: 'statement.pdf', Size: '2048' }
    ]);
  });

  it('throws a descriptive error when Zoho returns an OAUTH_SCOPE_MISMATCH', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        access_token: 'access-token',
        scope: 'crm.read crm.write crm.attach.READ workdrive.files.READ',
        expires_in: 3600
      }
    });

    const service = new ZohoCrmService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token'
    });

    const scopeError = new Error('invalid oauth scope to access this URL');
    scopeError.response = {
      status: 401,
      data: {
        code: 'OAUTH_SCOPE_MISMATCH',
        message: 'invalid oauth scope to access this URL'
      }
    };

    mockAxiosInstance.get.mockRejectedValueOnce(scopeError);

    await expect(service.getDealAttachments('deal-456'))
      .rejects.toThrow('Failed to retrieve attachments from Zoho: invalid oauth scope to access this URL');
  });
});
