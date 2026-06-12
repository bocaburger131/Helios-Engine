import { expect, vi, describe, it, beforeEach, afterEach } from 'vitest';
import zohoController from '../../src/controllers/zohoController.js';
import redisStreamService from '../../src/services/redisStreamService.js';
import { AppError } from '../../src/utils/errors.js';

// Mock dependencies
vi.mock('../../src/services/redisStreamService.js', () => ({
  __esModule: true,
  default: {
    addToStream: vi.fn(),
    streams: { STATEMENT_UPLOAD: 'analysis-jobs' }
  }
}));
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Zoho Controller', () => {
  let req;
  let res;
  let next;
  let mockCrmService;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup test environment variables
    process.env.ZOHO_CLIENT_ID = 'test-id';
    process.env.ZOHO_CLIENT_SECRET = 'test-secret';
    process.env.ZOHO_REFRESH_TOKEN = 'test-token';
    process.env.ZOHO_API_DOMAIN = 'https://test.zohoapis.com';

    // Mock request object
    req = {
      validated: {
        dealId: 'test-deal-123'
      },
      crmService: null
    };

    // Mock response object
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    // Mock next function
    next = vi.fn();

    // Mock CRM service instance
    mockCrmService = {
      getDealAttachments: vi.fn(),
      processAttachments: vi.fn(),
      getAttachmentsForDeal: undefined
    };

    // Reset zohoController state so tests can inject their own service
    zohoController.zohoCrmService = null;
  });

  afterEach(() => {
    vi.resetAllMocks();
    
    // Clean up environment variables
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_CLIENT_SECRET;
    delete process.env.ZOHO_REFRESH_TOKEN;
    delete process.env.ZOHO_API_DOMAIN;
  });

  describe('startAnalysisHandler', () => {
    it('should be an array of middleware functions', () => {
      const handlers = zohoController.getStartAnalysisHandler();
      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers).toHaveLength(2);
    });

    describe('startAnalysis', () => {
      it('should process valid bank statement analysis request', async () => {
        const mockAttachments = [
          {
            id: 'att-1',
            File_Name: 'statement1.pdf',
            Size: '12345'
          }
        ];

        mockCrmService.getDealAttachments.mockResolvedValue(mockAttachments);
        mockCrmService.processAttachments.mockResolvedValue([
          {
            id: 'att-1',
            fileName: 'statement1.pdf',
            filePath: '/tmp/uploads/statement1.pdf',
            source: 'CRM'
          }
        ]);

        // Mock Redis stream
  const mockJobId = 'job-123';
  redisStreamService.addToStream.mockResolvedValue(mockJobId);
  redisStreamService.streams = { STATEMENT_UPLOAD: 'statements' };

        // Set CRM service on request
        req.crmService = mockCrmService;

        // Execute handler
        await zohoController.startAnalysis(req, res, next);

        // Verify CRM service was called
        expect(mockCrmService.getDealAttachments).toHaveBeenCalledWith('test-deal-123');
        expect(mockCrmService.processAttachments).toHaveBeenCalledWith('test-deal-123', mockAttachments);

        // Verify Redis stream was called
        expect(redisStreamService.addToStream).toHaveBeenCalledWith(
          'statements',
          expect.objectContaining({
            type: 'statement_analysis',
            payload: expect.objectContaining({
              dealId: 'test-deal-123'
            })
          })
        );

        // Verify response (202 for async job acceptance)
        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          message: 'Analysis started. Results will be available in Zoho CRM.',
          data: expect.objectContaining({
            jobId: mockJobId,
            dealId: 'test-deal-123',
            filesQueued: 1
          })
        }));
      });

      it('should handle case with no PDF attachments', async () => {
        const rawAttachments = [
          { id: 'att-1', File_Name: 'document.txt', Size: '123' }
        ];
        mockCrmService.getDealAttachments.mockResolvedValue(rawAttachments);
        mockCrmService.processAttachments.mockResolvedValue([]);

        // Set CRM service on request
        req.crmService = mockCrmService;

        // Execute handler
        await zohoController.startAnalysis(req, res, next);

        // Verify response for no PDFs
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          message: 'No PDF bank statements found to analyze.',
          details: expect.objectContaining({
            dealId: 'test-deal-123',
            attachmentsFound: rawAttachments.length,
            hint: expect.any(String)
          })
        }));
        expect(redisStreamService.addToStream).not.toHaveBeenCalled();
      });

      it('should return descriptive response when Zoho deal is not found', async () => {
        const notFoundError = new Error('Record not found');
        notFoundError.response = {
          status: 404,
          data: { message: 'Record not found' }
        };

        mockCrmService.getDealAttachments.mockRejectedValue(notFoundError);
        req.crmService = mockCrmService;

        await zohoController.startAnalysis(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: false,
          code: 'ZOHO_DEAL_NOT_FOUND',
          details: expect.objectContaining({
            dealId: 'test-deal-123',
            statusCode: 404,
            nextSteps: expect.arrayContaining([
              expect.stringContaining('Verify'),
              expect.stringContaining('Ensure'),
              expect.stringContaining('Confirm')
            ])
          })
        }));
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle CRM service initialization error', async () => {
        // Don't set CRM service on request and reset controller's CRM service
        req.crmService = null;
        zohoController.zohoCrmService = null;
        
        // Clear environment variables
        process.env.ZOHO_CLIENT_ID = '';
        process.env.ZOHO_CLIENT_SECRET = '';
        process.env.ZOHO_REFRESH_TOKEN = '';
        
        // Execute handler
        await zohoController.startAnalysis(req, res, next);

        // Verify error handling
        expect(next).toHaveBeenCalledWith(
          expect.any(AppError)
        );
        expect(next.mock.calls[0][0].message).toBe('Zoho CRM service not initialized');
      });

      it('should handle CRM API errors', async () => {
        // Mock API error
        const apiError = new Error('API Error');
        mockCrmService.getDealAttachments.mockRejectedValue(apiError);
        req.crmService = mockCrmService;

        // Execute handler
        await zohoController.startAnalysis(req, res, next);

        // Verify error handling
        expect(next).toHaveBeenCalledWith(apiError);
      });
    });
  });
});
