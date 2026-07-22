/**
 * SOS Verification Routes
 * 
 * API routes for business verification through California Secretary of State
 */

import express from 'express';
import sosVerificationController from '../controllers/sosVerificationController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { saveRegistryCredentials } from '../services/businessRegistry/registryCredentialVault.js';
import businessRegistryOrchestrator from '../services/businessRegistry/orchestrator.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for SOS verification endpoints
const sosRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: {
        success: false,
        error: 'Too many verification requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Validation removed CA-only gate — orchestrator resolves any onboarded state

/**
 * @route   POST /api/sos/verify
 * @desc    Submit a business verification job
 * @access  Public (rate limited)
 */
router.post('/verify',
    sosRateLimit,
    asyncHandler(sosVerificationController.submitVerification)
);

/**
 * @route   GET /api/sos/verify/:jobId
 * @desc    Get verification result by job ID
 * @access  Public
 */
router.get('/verify/:jobId',
    asyncHandler(sosVerificationController.getVerificationResult)
);

/**
 * @route   POST /api/sos/verify-sync
 * @desc    Verify business synchronously (immediate result)
 * @access  Public (rate limited)
 */
router.post('/verify-sync',
    sosRateLimit,
    asyncHandler(sosVerificationController.verifySynchronously)
);

/**
 * @route   POST /api/sos/verify-bulk
 * @desc    Submit multiple business verification jobs
 * @access  Public (rate limited)
 */
router.post('/verify-bulk',
    sosRateLimit,
    asyncHandler(sosVerificationController.submitBulkVerification)
);

/**
 * @route   POST /api/sos/credentials
 * @desc    Store encrypted state portal credentials (Vera paywall flow)
 */
router.post('/credentials', sosRateLimit, asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.body.userId;
    const { stateCode, credentials, businessName, businessAddress, retryVerification } = req.body;
    if (!userId || !stateCode || !credentials) {
        return res.status(400).json({ success: false, error: 'userId, stateCode, and credentials required' });
    }
    await saveRegistryCredentials(userId, stateCode, credentials);

    let verification = null;
    if (retryVerification !== false && process.env.USE_SOS_VERIFICATION === 'true' && businessName) {
        verification = await businessRegistryOrchestrator.verify({
            businessName,
            registrationState: stateCode,
            businessAddress,
            jobId: `credentials-retry-${Date.now()}`,
            userId
        });
    }

    res.json({
        success: true,
        message: 'Credentials saved',
        verification
    });
}));

/**
 * @route   GET /api/sos/status
 * @desc    Get queue status and service information
 * @access  Public
 */
router.get('/status',
    asyncHandler(sosVerificationController.getQueueStatus)
);

/**
 * @route   GET /api/sos/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health',
    asyncHandler(sosVerificationController.healthCheck)
);

export default router;
