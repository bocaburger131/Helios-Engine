/**
 * SOS Verification Routes
 * 
 * API routes for business verification through California Secretary of State
 */

import express from 'express';
import sosVerificationController from '../controllers/sosVerificationController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateRequest } from '../middleware/validation.js';
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

// Validation schemas
const verificationSchema = {
    businessName: {
        type: 'string',
        required: true,
        minLength: 2,
        maxLength: 200,
        trim: true
    },
    state: {
        type: 'string',
        required: true,
        enum: ['California', 'CA', 'california', 'ca'],
        trim: true
    }
};

const bulkVerificationSchema = {
    businesses: {
        type: 'array',
        required: true,
        maxItems: 50,
        items: verificationSchema
    }
};

/**
 * @route   POST /api/sos/verify
 * @desc    Submit a business verification job
 * @access  Public (rate limited)
 */
router.post('/verify',
    sosRateLimit,
    validateRequest(verificationSchema),
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
    validateRequest(verificationSchema),
    asyncHandler(sosVerificationController.verifySynchronously)
);

/**
 * @route   POST /api/sos/verify-bulk
 * @desc    Submit multiple business verification jobs
 * @access  Public (rate limited)
 */
router.post('/verify-bulk',
    sosRateLimit,
    validateRequest(bulkVerificationSchema),
    asyncHandler(sosVerificationController.submitBulkVerification)
);

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
