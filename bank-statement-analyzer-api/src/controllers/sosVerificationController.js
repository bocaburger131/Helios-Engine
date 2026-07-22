/**
 * REST API for business registry (Secretary of State) verification.
 */

import businessRegistryOrchestrator from '../services/businessRegistry/orchestrator.js';
import { resolveStateCode } from '../services/businessRegistry/stateResolver.js';
import { enqueueRegistryDiscoveryJob } from '../services/businessRegistry/registryDiscoveryQueue.js';
import logger from '../utils/logger.js';

class SosVerificationController {
  async submitVerification(req, res) {
    try {
      const { businessName, state } = req.body;
      if (!businessName) {
        return res.status(400).json({ success: false, error: 'Business name is required' });
      }
      const stateCode = resolveStateCode(state);
      if (!stateCode) {
        return res.status(400).json({ success: false, error: 'Valid state is required' });
      }

      const job = await enqueueRegistryDiscoveryJob({ businessName, stateCode });
      const jobId = job?.id ? String(job.id) : `registry-${Date.now()}`;

      res.status(202).json({
        success: true,
        message: 'Verification queued',
        jobId,
        businessName,
        state: stateCode
      });
    } catch (error) {
      logger.error('Error submitting registry verification:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getVerificationResult(req, res) {
    res.status(501).json({
      success: false,
      error: 'Poll batch statement analysis for sosVerification in analysis.metadata'
    });
  }

  async getQueueStatus(req, res) {
    res.json({
      success: true,
      status: {
        enabled: process.env.USE_SOS_VERIFICATION === 'true',
        strategy: 'businessRegistryOrchestrator'
      }
    });
  }

  async verifySynchronously(req, res) {
    try {
      const { businessName, state, businessAddress } = req.body;
      if (!businessName || !state) {
        return res.status(400).json({
          success: false,
          error: 'Business name and state are required'
        });
      }

      req.setTimeout(300000);
      res.setTimeout(300000);

      const result = await businessRegistryOrchestrator.verify({
        businessName,
        registrationState: state,
        businessAddress,
        jobId: `sync-${Date.now()}`,
        userId: req.user?.id || null
      });

      res.json({ success: true, result });
    } catch (error) {
      logger.error('Error in synchronous registry verification:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async submitBulkVerification(req, res) {
    const { businesses } = req.body;
    if (!Array.isArray(businesses)) {
      return res.status(400).json({ success: false, error: 'Businesses array is required' });
    }

    const jobs = [];
    for (const b of businesses.slice(0, 50)) {
      if (!b.businessName || !b.state) continue;
      const result = await businessRegistryOrchestrator.verify({
        businessName: b.businessName,
        registrationState: b.state,
        jobId: `bulk-${Date.now()}-${jobs.length}`
      });
      jobs.push(result);
    }

    res.status(202).json({ success: true, results: jobs });
  }

  async healthCheck(req, res) {
    res.json({
      success: true,
      service: 'Business Registry Verification',
      status: 'healthy',
      enabled: process.env.USE_SOS_VERIFICATION === 'true',
      timestamp: new Date().toISOString()
    });
  }
}

export default new SosVerificationController();
