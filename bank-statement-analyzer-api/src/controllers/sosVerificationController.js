/**
 * SOS Verification Controller
 * 
 * RESTful API endpoints for managing business verification
 * through the California Secretary of State website.
 */

import SosVerificationService from '../services/sosVerificationService.js';
import logger from '../utils/logger.js';

class SosVerificationController {
    constructor() {
        this.sosService = new SosVerificationService();
    }

    /**
     * Submit a new business verification job
     * POST /api/sos/verify
     */
    async submitVerification(req, res) {
        try {
            const { businessName, state } = req.body;
            
            // Validation
            if (!businessName) {
                return res.status(400).json({
                    success: false,
                    error: 'Business name is required'
                });
            }
            
            if (!state) {
                return res.status(400).json({
                    success: false,
                    error: 'State is required'
                });
            }
            
            // Currently only supports California
            if (state.toLowerCase() !== 'california' && state.toLowerCase() !== 'ca') {
                return res.status(400).json({
                    success: false,
                    error: 'Currently only California business verification is supported'
                });
            }
            
            logger.info(`Submitting SOS verification for: ${businessName} in ${state}`);
            
            // Add job to queue
            const jobId = await this.sosService.addVerificationJob(businessName, state);
            
            res.status(202).json({
                success: true,
                message: 'Verification job submitted successfully',
                jobId,
                businessName,
                state,
                estimatedTime: '2-5 minutes'
            });
            
        } catch (error) {
            logger.error('Error submitting SOS verification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to submit verification job',
                details: error.message
            });
        }
    }

    /**
     * Get verification result by job ID
     * GET /api/sos/verify/:jobId
     */
    async getVerificationResult(req, res) {
        try {
            const { jobId } = req.params;
            
            if (!jobId) {
                return res.status(400).json({
                    success: false,
                    error: 'Job ID is required'
                });
            }
            
            logger.info(`Retrieving SOS verification result for job: ${jobId}`);
            
            const result = await this.sosService.getVerificationResult(jobId);
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'Verification result not found',
                    message: 'Job may still be processing or job ID is invalid'
                });
            }
            
            res.json({
                success: true,
                result
            });
            
        } catch (error) {
            logger.error('Error retrieving SOS verification result:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve verification result',
                details: error.message
            });
        }
    }

    /**
     * Get queue status and statistics
     * GET /api/sos/status
     */
    async getQueueStatus(req, res) {
        try {
            logger.info('Retrieving SOS verification queue status');
            
            const status = await this.sosService.getQueueStatus();
            
            res.json({
                success: true,
                status: {
                    ...status,
                    supportedStates: ['California'],
                    features: [
                        'Business name verification',
                        'Active status confirmation',
                        'Registration date retrieval',
                        'Stealth browser automation'
                    ]
                }
            });
            
        } catch (error) {
            logger.error('Error retrieving queue status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve queue status',
                details: error.message
            });
        }
    }

    /**
     * Verify business synchronously (for testing/immediate results)
     * POST /api/sos/verify-sync
     */
    async verifySynchronously(req, res) {
        try {
            const { businessName, state } = req.body;
            
            // Validation
            if (!businessName || !state) {
                return res.status(400).json({
                    success: false,
                    error: 'Business name and state are required'
                });
            }
            
            if (state.toLowerCase() !== 'california' && state.toLowerCase() !== 'ca') {
                return res.status(400).json({
                    success: false,
                    error: 'Currently only California business verification is supported'
                });
            }
            
            logger.info(`Starting synchronous SOS verification for: ${businessName} in ${state}`);
            
            // Set longer timeout for this endpoint
            req.setTimeout(300000); // 5 minutes
            res.setTimeout(300000);
            
            // Perform verification directly
            const result = await this.sosService.verifyBusiness({
                businessName,
                state,
                jobId: `sync-${Date.now()}`
            });
            
            res.json({
                success: true,
                result
            });
            
        } catch (error) {
            logger.error('Error in synchronous SOS verification:', error);
            res.status(500).json({
                success: false,
                error: 'Verification failed',
                details: error.message
            });
        }
    }

    /**
     * Bulk verification endpoint
     * POST /api/sos/verify-bulk
     */
    async submitBulkVerification(req, res) {
        try {
            const { businesses } = req.body;
            
            if (!businesses || !Array.isArray(businesses)) {
                return res.status(400).json({
                    success: false,
                    error: 'Businesses array is required'
                });
            }
            
            if (businesses.length > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 50 businesses per bulk request'
                });
            }
            
            logger.info(`Submitting bulk SOS verification for ${businesses.length} businesses`);
            
            const jobIds = [];
            const errors = [];
            
            for (const business of businesses) {
                try {
                    if (!business.businessName || !business.state) {
                        errors.push({
                            business,
                            error: 'Business name and state are required'
                        });
                        continue;
                    }
                    
                    const jobId = await this.sosService.addVerificationJob(
                        business.businessName, 
                        business.state
                    );
                    
                    jobIds.push({
                        businessName: business.businessName,
                        state: business.state,
                        jobId
                    });
                    
                } catch (error) {
                    errors.push({
                        business,
                        error: error.message
                    });
                }
            }
            
            res.status(202).json({
                success: true,
                message: `Submitted ${jobIds.length} verification jobs`,
                jobs: jobIds,
                errors: errors.length > 0 ? errors : undefined,
                estimatedTime: '5-15 minutes for all jobs'
            });
            
        } catch (error) {
            logger.error('Error submitting bulk SOS verification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to submit bulk verification',
                details: error.message
            });
        }
    }

    /**
     * Health check endpoint
     * GET /api/sos/health
     */
    async healthCheck(req, res) {
        try {
            const status = await this.sosService.getQueueStatus();
            
            res.json({
                success: true,
                service: 'SOS Verification Service',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                queue: status
            });
            
        } catch (error) {
            logger.error('SOS service health check failed:', error);
            res.status(503).json({
                success: false,
                service: 'SOS Verification Service',
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

export default SosVerificationController;
