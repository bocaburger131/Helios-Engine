import express from 'express';
import { zohoCrmService } from '../services/crm/zoho.service.js';
import zohoAuthService from '../services/zohoAuthService.js';
import { validateApiKey, validateZohoStartAnalysisApiKey } from '../middleware/apiKeyAuth.js';
import auth from '../middleware/auth.js';
import zohoController from '../controllers/zohoController.js';
import logger from '../utils/logger.js';
import { validateRequest, analysisRequestSchema } from '../validation/zodSchemas.js';

const router = express.Router();

// Middleware to pass the initialized CRM service to the request object
const provideCrmService = (req, res, next) => {
  req.crmService = zohoCrmService;
  next();
};

// ===== OAUTH UTILITIES =====

router.get('/oauth/url', (req, res) => {
    try {
        const url = zohoAuthService.getAuthorizationUrl();

        res.json({
            success: true,
            url
        });
    } catch (error) {
        logger.error('Failed to generate Zoho OAuth URL', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to generate Zoho OAuth URL',
            message: error.message
        });
    }
});

router.post('/oauth/exchange', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Authorization code is required'
            });
        }

        logger.info('Received request to exchange Zoho authorization code');
        const tokens = await zohoAuthService.exchangeCodeForTokens(code);
        await zohoAuthService.persistTokens(tokens);

        logger.info('Zoho tokens stored successfully via manual exchange', {
            hasAccessToken: !!tokens.accessToken,
            hasRefreshToken: !!tokens.refreshToken
        });

        return res.json({
            success: true,
            message: 'Zoho authorization code exchanged successfully',
            tokens: {
                accessToken: tokens.accessToken ? '***' + tokens.accessToken.slice(-4) : null,
                refreshToken: tokens.refreshToken ? '***' + tokens.refreshToken.slice(-4) : null,
                expiresIn: tokens.expiresIn ?? null,
                expiryTime: tokens.expiryTime ?? null
            }
        });
    } catch (error) {
        logger.error('Failed to exchange Zoho authorization code', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to exchange Zoho authorization code',
            message: error.message
        });
    }
});

// ===== ANALYSIS ENDPOINTS =====

/**
 * @swagger
 * /api/zoho/start-analysis:
 *   post:
 *     summary: Start asynchronous analysis of bank statements for a Zoho deal
 *     tags: [Zoho]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dealId
 *             properties:
 *               dealId:
 *                 type: string
 *                 description: The Zoho CRM Deal ID
 *     responses:
 *       202:
 *         description: Analysis started successfully
 *       400:
 *         description: Deal ID is required
 *       500:
 *         description: Server error
 */
router.post(
    '/start-analysis', 
    validateZohoStartAnalysisApiKey, 
    validateRequest(analysisRequestSchema),
    provideCrmService, // Pass the service to the controller
    zohoController.startAnalysis
);

/**
 * @swagger
 * /api/zoho/analysis-status/{jobId}:
 *   get:
 *     summary: Get the status of an analysis job
 *     tags: [Zoho]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Analysis job ID
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 *       404:
 *         description: Job not found
 */
router.get(
    '/analysis-status/:jobId', 
    validateApiKey, 
    auth.authenticateToken, 
    zohoController.getAnalysisStatus
);

// ===== DEBUG & TEST ENDPOINTS =====

router.get('/deals/:dealId', provideCrmService, async (req, res) => {
    try {
        const { dealId } = req.params;
        logger.info(`Fetching CRM deal ${dealId}`);

        const deal = await req.crmService.getDeal(dealId);

        if (!deal) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        res.json({
            success: true,
            data: deal
        });
    } catch (error) {
        logger.error(`Failed to fetch CRM deal ${req.params.dealId}`, {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch CRM deal',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/zoho/test-attachments/{dealId}:
 *   get:
 *     summary: Test fetching attachments for a deal
 *     tags: [Zoho, Debug]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Zoho CRM Deal ID to test
 *     responses:
 *       200:
 *         description: Attachments fetched successfully
 *       500:
 *         description: Error fetching attachments
 */
router.get('/test-attachments/:dealId', provideCrmService, async (req, res) => {
    try {
        const { dealId } = req.params;
        logger.info(`Executing test attachment fetch for deal ID: ${dealId}`);

        // 1. Fetch attachment metadata using the correct method name.
        const rawAttachments = await req.crmService.getDealAttachments(dealId);
        if (!rawAttachments || rawAttachments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No attachments found for this deal.',
            });
        }

        // 2. Process the attachments (which includes downloading them).
        const processedAttachments = await req.crmService.processAttachments(dealId, rawAttachments);

        res.status(200).json({
            success: true,
            message: `Found ${rawAttachments.length} attachments, successfully processed and downloaded ${processedAttachments.length}.`,
            data: processedAttachments.map(a => ({
                id: a.id,
                fileName: a.File_Name,
                filePath: a.filePath,
                source: a.source,
                size: a.Size,
            })),
        });
    } catch (error) {
        logger.error(`Failed to test attachments for deal ${req.params.dealId}`, {
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attachments',
            message: error.message,
        });
    }
});

export default router;
