/**
 * SOS Verification API Integration Example
 * 
 * Demonstrates how to create API endpoints that interact with the
 * SOS Verification Service for business verification requests.
 */

import express from 'express';
import SosVerificationService from './src/services/sosVerificationService.js';
import logger from './src/utils/logger.js';

console.log('🌐 SOS Verification API Integration Example');
console.log('=' * 60);

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize SOS Verification Service
const sosService = new SosVerificationService({
  redisConfig: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
  },
  queueName: 'sos-verification-api-queue'
});

console.log('📋 API Endpoints Overview:');
console.log('---------------------------');
console.log('🔹 POST /api/sos/verify - Submit business verification request');
console.log('🔹 GET /api/sos/result/:jobId - Get verification result by job ID');
console.log('🔹 GET /api/sos/status - Get queue and service status');
console.log('🔹 POST /api/sos/verify/direct - Direct verification (bypass queue)');

/**
 * Submit business verification request
 * Adds job to Redis queue and returns job ID for tracking
 */
app.post('/api/sos/verify', async (req, res) => {
  try {
    const { businessName, state = 'california', priority = 'normal' } = req.body;

    // Validate input
    if (!businessName || typeof businessName !== 'string' || businessName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Business name is required and must be a non-empty string'
      });
    }

    // Add verification job to queue
    const jobId = await sosService.addVerificationJob(businessName.trim(), state);

    logger.info('SOS verification request submitted', {
      jobId,
      businessName: businessName.trim(),
      state,
      priority
    });

    res.json({
      success: true,
      jobId,
      businessName: businessName.trim(),
      state,
      message: 'Verification request submitted successfully',
      estimatedProcessingTime: '30-60 seconds'
    });

  } catch (error) {
    logger.error('SOS verification request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit verification request',
      details: error.message
    });
  }
});

/**
 * Get verification result by job ID
 * Returns the verification result if completed, or status if still processing
 */
app.get('/api/sos/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Get verification result from Redis
    const result = await sosService.getVerificationResult(jobId);

    if (result) {
      logger.info('SOS verification result retrieved', { jobId, success: result.success });
      res.json(result);
    } else {
      // Check if job is still in queue
      const queueStatus = await sosService.getQueueStatus();
      
      res.json({
        success: false,
        jobId,
        status: 'processing',
        message: 'Verification still in progress or job not found',
        queueLength: queueStatus.queueLength,
        estimatedWaitTime: queueStatus.queueLength * 30 + ' seconds'
      });
    }

  } catch (error) {
    logger.error('Failed to retrieve SOS verification result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve verification result',
      details: error.message
    });
  }
});

/**
 * Get service and queue status
 * Returns current queue length, processing status, and service health
 */
app.get('/api/sos/status', async (req, res) => {
  try {
    const queueStatus = await sosService.getQueueStatus();
    
    res.json({
      success: true,
      service: 'SOS Verification Service',
      queue: {
        length: queueStatus.queueLength,
        activeResults: queueStatus.activeResults,
        isProcessing: queueStatus.isProcessing
      },
      worker: {
        status: queueStatus.isProcessing ? 'active' : 'idle',
        estimatedProcessingTime: '30-60 seconds per job'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get SOS service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status',
      details: error.message
    });
  }
});

/**
 * Direct verification (bypass queue)
 * Performs immediate verification without using Redis queue
 */
app.post('/api/sos/verify/direct', async (req, res) => {
  try {
    const { businessName, state = 'california' } = req.body;

    // Validate input
    if (!businessName || typeof businessName !== 'string' || businessName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Business name is required and must be a non-empty string'
      });
    }

    // Generate job ID for tracking
    const jobId = `direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Direct SOS verification started', {
      jobId,
      businessName: businessName.trim(),
      state
    });

    // Perform direct verification
    const result = await sosService.verifyBusiness({
      jobId,
      businessName: businessName.trim(),
      state
    });

    logger.info('Direct SOS verification completed', {
      jobId,
      success: result.success,
      found: result.found
    });

    res.json(result);

  } catch (error) {
    logger.error('Direct SOS verification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Direct verification failed',
      details: error.message
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/sos/health', async (req, res) => {
  try {
    const queueStatus = await sosService.getQueueStatus();
    
    res.json({
      status: 'healthy',
      service: 'SOS Verification Service',
      redis: 'connected',
      queue: queueStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Documentation endpoint
app.get('/api/sos/docs', (req, res) => {
  res.json({
    service: 'SOS Verification API',
    version: '1.0.0',
    description: 'API for California Secretary of State business verification',
    endpoints: {
      'POST /api/sos/verify': {
        description: 'Submit business verification request',
        body: {
          businessName: 'string (required)',
          state: 'string (optional, default: california)',
          priority: 'string (optional, default: normal)'
        },
        response: {
          success: 'boolean',
          jobId: 'string',
          businessName: 'string',
          state: 'string',
          message: 'string',
          estimatedProcessingTime: 'string'
        }
      },
      'GET /api/sos/result/:jobId': {
        description: 'Get verification result by job ID',
        parameters: {
          jobId: 'string (required)'
        },
        response: {
          success: 'boolean',
          jobId: 'string',
          businessName: 'string',
          found: 'boolean',
          status: 'string',
          registrationDate: 'string',
          isActive: 'boolean'
        }
      },
      'GET /api/sos/status': {
        description: 'Get service and queue status',
        response: {
          success: 'boolean',
          service: 'string',
          queue: 'object',
          worker: 'object',
          timestamp: 'string'
        }
      },
      'POST /api/sos/verify/direct': {
        description: 'Direct verification (bypass queue)',
        body: {
          businessName: 'string (required)',
          state: 'string (optional, default: california)'
        },
        response: 'Same as queued verification result'
      }
    },
    examples: {
      verifyRequest: {
        url: 'POST /api/sos/verify',
        body: {
          businessName: 'Apple Inc',
          state: 'california'
        }
      },
      resultRequest: {
        url: 'GET /api/sos/result/sos-1234567890-abc123'
      }
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('API error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Demo mode - don't actually start server
if (process.env.NODE_ENV !== 'demo') {
  const PORT = process.env.PORT || 3000;
  
  app.listen(PORT, () => {
    console.log(`🚀 SOS Verification API running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/sos/docs`);
    console.log(`🔍 Health Check: http://localhost:${PORT}/api/sos/health`);
  });
} else {
  console.log('\n📚 API Integration Example (Demo Mode)');
  console.log('======================================');
  
  console.log('\n🔧 Usage Examples:');
  console.log('------------------');
  console.log('1. Submit verification request:');
  console.log('   POST /api/sos/verify');
  console.log('   Body: { "businessName": "Apple Inc", "state": "california" }');
  
  console.log('\n2. Check result:');
  console.log('   GET /api/sos/result/{jobId}');
  
  console.log('\n3. Get service status:');
  console.log('   GET /api/sos/status');
  
  console.log('\n4. Direct verification:');
  console.log('   POST /api/sos/verify/direct');
  console.log('   Body: { "businessName": "Apple Inc" }');
  
  console.log('\n📊 Response Examples:');
  console.log('---------------------');
  console.log('Verification Request Response:');
  console.log(JSON.stringify({
    success: true,
    jobId: 'sos-1234567890-abc123',
    businessName: 'Apple Inc',
    state: 'california',
    message: 'Verification request submitted successfully',
    estimatedProcessingTime: '30-60 seconds'
  }, null, 2));
  
  console.log('\nVerification Result Response:');
  console.log(JSON.stringify({
    success: true,
    jobId: 'sos-1234567890-abc123',
    businessName: 'Apple Inc',
    state: 'california',
    found: true,
    status: 'ACTIVE',
    registrationDate: '1977-01-03',
    isActive: true,
    matchedBusinessName: 'APPLE INC.',
    timestamp: '2024-01-15T10:35:00.000Z'
  }, null, 2));
  
  console.log('\n🔧 To start the actual API server:');
  console.log('   Remove NODE_ENV=demo and run: node api-sos-verification-example.js');
}

export default app;
