import { Types } from 'mongoose';
import redisStreamService from '../services/redisStreamService.js';
import ZohoCrmService, { zohoCrmService as sharedZohoCrmService } from '../services/crm/zoho.service.js';
import Statement from '../models/Statement.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { validateRequest, analysisRequestSchema, jobIdSchema } from '../validation/zodSchemas.js';
import { jobMetrics, zohoMetrics } from '../monitoring/metrics.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'tmp', 'uploads');

class ZohoController {
  constructor() {
    this.zohoCrmService = sharedZohoCrmService || null;
    this.integrationUserId = this.resolveIntegrationUserId();
    this.initializeZohoCrmService();

    // Bind methods to preserve 'this' context
    this.startAnalysis = this.startAnalysis.bind(this);
    this.getAnalysisStatus = this.getAnalysisStatus.bind(this);
    this.handleMissingZohoDeal = this.handleMissingZohoDeal.bind(this);
  }

  resolveIntegrationUserId() {
    const candidateIds = [
      process.env.ZOHO_INTEGRATION_USER_ID,
      process.env.SYSTEM_USER_ID,
      process.env.DEFAULT_USER_ID
    ].filter(Boolean);

    for (const id of candidateIds) {
      if (Types.ObjectId.isValid(id)) {
        return new Types.ObjectId(id);
      }
    }

    return new Types.ObjectId();
  }

  initializeZohoCrmService() {
    if (!this.zohoCrmService) {
      const config = {
        clientId: process.env.ZOHO_CLIENT_ID,
        clientSecret: process.env.ZOHO_CLIENT_SECRET,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN,
        apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
        apiVersion: 'v2',
        accountsUrl: process.env.ZOHO_AUTH_URL || process.env.ZOHO_ACCOUNTS_URL
      };
      
      if (config.clientId && config.clientSecret && config.refreshToken) {
        this.zohoCrmService = new ZohoCrmService(config);
        logger.info('Zoho CRM service initialized successfully');
      } else {
        logger.warn('Zoho CRM service not initialized - missing required environment variables');
      }
    }
    return this.zohoCrmService;
  }

  handleMissingZohoDeal(dealId, error) {
    const statusCode = error?.response?.status || error?.status || 404;
    const errorMessage = error?.response?.data?.message || error?.message;

    logger.warn('Zoho deal not found or inaccessible.', {
      dealId,
      statusCode,
      error: errorMessage
    });

    try {
      zohoMetrics.apiCallTotal.inc({ endpoint: 'attachments', status: 'not_found' });
    } catch (metricError) {
      logger.debug('Failed to record Zoho metrics for missing deal', {
        dealId,
        metricError: metricError.message
      });
    }
  }

  async startAnalysis(req, res, next) {
    const startTime = Date.now();
    jobMetrics.activeJobs.inc({ jobType: 'statement_analysis' });
    let metricStatus = 'error';

    try {
      const { dealId } = req.validated;
      logger.info(`Starting analysis for Deal ID: ${dealId}`, { dealId });

      let crmService = req.crmService || this.zohoCrmService;
      if (!crmService) {
        crmService = this.initializeZohoCrmService();
      }

      if (!crmService) {
        throw new AppError('Zoho CRM service not initialized', 500);
      }

      let rawAttachments = [];
      let processedAttachments = [];

      if (typeof crmService.getDealAttachments === 'function' && typeof crmService.processAttachments === 'function') {
        rawAttachments = await crmService.getDealAttachments(dealId);
        processedAttachments = await crmService.processAttachments(dealId, rawAttachments);
      } else if (typeof crmService.getAttachmentsForDeal === 'function') {
        processedAttachments = await crmService.getAttachmentsForDeal(dealId);
        rawAttachments = rawAttachments.length ? rawAttachments : processedAttachments;
      } else {
        throw new AppError('Zoho CRM service missing attachment handlers', 500);
      }

      const pdfAttachments = (processedAttachments || []).filter((attachment) => {
        const name = (attachment.fileName || attachment.File_Name || '').toLowerCase();
        return path.extname(name) === '.pdf';
      });

      if (!rawAttachments || rawAttachments.length === 0) {
        logger.warn(`No attachments found for Deal ID: ${dealId}`);
        metricStatus = 'success';
        return res.status(404).json({
          success: false,
          code: 'ZOHO_ATTACHMENTS_NOT_FOUND',
          message: `No attachments found for Deal ID: ${dealId}.`,
        });
      }

      if (pdfAttachments.length === 0) {
        logger.warn(`No PDF attachments found to process for Deal ID: ${dealId}.`);
        metricStatus = 'success';
        return res.status(200).json({
          success: true,
          message: 'No PDF bank statements found to analyze.',
          details: {
            dealId,
            attachmentsFound: rawAttachments.length,
            hint: 'Only PDF attachments are supported. Upload a PDF bank statement and try again.'
          }
        });
      }

      const streamKey = redisStreamService.streams?.STATEMENT_UPLOAD ?? 'statement-analysis';
      const filesForQueue = pdfAttachments.map((attachment) => ({
        fileName: attachment.fileName || attachment.File_Name,
        filePath: attachment.filePath,
        attachmentId: attachment.id || attachment.attachmentId,
        source: attachment.source || 'Zoho'
      }));

      const jobPayload = {
        type: 'statement_analysis',
        payload: {
          dealId,
          files: filesForQueue,
          metadata: {
            totalAttachments: rawAttachments.length,
            pdfAttachments: pdfAttachments.length
          }
        }
      };

      const jobId = await redisStreamService.addToStream(streamKey, jobPayload);
      metricStatus = 'success';

      return res.status(202).json({
        success: true,
        message: 'Analysis started. Results will be available in Zoho CRM.',
        data: {
          jobId,
          dealId,
          filesQueued: pdfAttachments.length,
          stream: streamKey
        }
      });
    } catch (error) {
      const dealId = req.validated?.dealId || req.body.dealId;

      if (error?.response?.status === 404) {
        this.handleMissingZohoDeal(dealId, error);
        metricStatus = 'error';
        return res.status(404).json({
          success: false,
          code: 'ZOHO_DEAL_NOT_FOUND',
          message: 'The specified Zoho deal could not be found.',
          details: {
            dealId,
            statusCode: 404,
            nextSteps: [
              'Verify the deal ID in Zoho CRM.',
              'Ensure the authorized Zoho account has access to the deal.',
              'Confirm the integration user can read deal attachments.'
            ]
          }
        });
      }

      if (error instanceof AppError) {
        metricStatus = 'error';
        return next(error);
      }

      logger.error(`Error starting analysis for Deal ID: ${dealId}`, {
        dealId,
        error: error.message
      });
      metricStatus = 'error';
      return next(error);
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      try {
        jobMetrics.processingDuration.observe({ jobType: 'statement_analysis', status: metricStatus }, duration);
        jobMetrics.jobsTotal.inc({ jobType: 'statement_analysis', status: metricStatus });
      } catch (metricError) {
        logger.debug('Failed to record Zoho metrics', { error: metricError.message });
      }
      jobMetrics.activeJobs.dec({ jobType: 'statement_analysis' });
    }
  }

  async getAnalysisStatus(req, res, next) {
    const startTime = Date.now();
    try {
      const { jobId } = req.validated;

      const streamInfo = await redisStreamService.getStreamInfo(
        redisStreamService.streams.STATEMENT_UPLOAD
      );
      
      const status = streamInfo.firstEntry ? streamInfo.firstEntry[1] : null;
      
      if (!status) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        data: {
          jobId,
          status: redisStreamService.parseMessage(status)
        }
      });

      const duration = (Date.now() - startTime) / 1000;
      jobMetrics.processingDuration.observe({ jobType: 'status_check', status: 'success' }, duration);

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      jobMetrics.processingDuration.observe({ jobType: 'status_check', status: 'error' }, duration);

      logger.error(`Error getting analysis status for Job ID: ${req.validated?.jobId || req.params.jobId}`, {
        jobId: req.validated?.jobId || req.params.jobId,
        error: error.message
      });
      next(error);
    }
  }

  // Middleware arrays for routes
  getStartAnalysisHandler() {
    // Bind the handler to preserve 'this' context
    const boundStartAnalysis = this.startAnalysis.bind(this);
    
    // Return middleware array
    return [
      validateRequest(analysisRequestSchema),
      boundStartAnalysis
    ];
  }

  getAnalysisStatusHandler() {
    // Bind the handler to preserve 'this' context
    const boundGetAnalysisStatus = this.getAnalysisStatus.bind(this);
    
    // Return middleware array
    return [
      validateRequest(jobIdSchema),
      boundGetAnalysisStatus
    ];
  }
}

// Create singleton instance with pre-bound methods
const zohoController = new ZohoController();

// Export the singleton instance
export default zohoController;
