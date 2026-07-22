/**
 * Business registry orchestrator — application-state-only dispatch.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import StateRegistryProfile from '../../models/StateRegistryProfile.js';
import logger from '../../utils/logger.js';
import { resolveStateCode, parseStateFromAddress } from './stateResolver.js';
import { buildSkippedResult, normalizeRegistryResult } from './resultNormalizer.js';
import { runPlaybook, interpretScrapeResult } from './playbookRunner.js';
import { resolvePlaybookMapping } from './playbookLoader.js';
import {
  getVerifiedPlaybook,
  getLatestLearningPlaybook,
  recordPlaybookOutcome
} from './registryGraduationService.js';
import { enqueueRegistryDiscoveryJob } from './registryDiscoveryQueue.js';
import { enqueueRegistryRepairJob } from './registryRepairQueue.js';
import { getRegistryCredentials } from './registryCredentialVault.js';

chromium.use(StealthPlugin());

let browserInstance = null;

function isSosEnabled() {
  return process.env.USE_SOS_VERIFICATION === 'true';
}

function isBrowserDisabled() {
  return process.env.NODE_ENV === 'test' || process.env.REGISTRY_BROWSER_DISABLED === 'true';
}

/**
 * @returns {Promise<import('playwright-core').Browser>}
 */
async function getBrowser() {
  if (browserInstance) return browserInstance;
  const headless = process.env.SOS_BROWSER_HEADLESS !== 'false';
  browserInstance = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  return browserInstance;
}

export async function closeRegistryBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

/**
 * @param {object} params
 * @param {string} params.businessName
 * @param {string} [params.registrationState]
 * @param {string} [params.businessAddress]
 * @param {string} [params.jobId]
 * @param {string} [params.userId]
 */
export async function verifyBusinessRegistry(params = {}) {
  const {
    businessName,
    registrationState,
    businessAddress,
    jobId = null,
    userId = null
  } = params;

  if (!isSosEnabled()) {
    return buildSkippedResult('SOS_DISABLED', { businessName, jobId });
  }

  const stateCode =
    resolveStateCode(registrationState) || parseStateFromAddress(businessAddress);

  if (!stateCode) {
    return buildSkippedResult('SOS_STATE_MISSING', {
      businessName,
      onboarding: false,
      alertCode: 'SOS_STATE_MISSING'
    });
  }

  if (!businessName) {
    return buildSkippedResult('BUSINESS_NAME_MISSING', { state: stateCode });
  }

  let profile = await StateRegistryProfile.findOne({ stateCode });
  if (!profile) {
    await enqueueRegistryDiscoveryJob({ stateCode, businessName, jobId }).catch((e) => {
      logger.warn(`[REGISTRY] Discovery enqueue failed for ${stateCode}: ${e.message}`);
    });
    return buildSkippedResult('SOS_ONBOARDING', {
      businessName,
      state: stateCode,
      unsupportedState: true,
      onboarding: true,
      alertCode: 'SOS_ONBOARDING'
    });
  }

  const accessTier = profile.accessTier || 'FREE_PUBLIC';
  if (accessTier === 'PAYWALL' || accessTier === 'LOGIN_REQUIRED') {
    const creds = userId ? await getRegistryCredentials(userId, stateCode) : null;
    if (!creds) {
      return buildSkippedResult('SOS_CREDENTIALS_REQUIRED', {
        businessName,
        state: stateCode,
        accessTier,
        portalSignupUrl: profile.portalSignupUrl || profile.officialPortalUrl,
        alertCode: 'SOS_CREDENTIALS_REQUIRED'
      });
    }
  }

  if (accessTier === 'MANUAL') {
    return buildSkippedResult('SOS_MANUAL_REVIEW', {
      businessName,
      state: stateCode,
      alertCode: 'SOS_MANUAL_REVIEW'
    });
  }

  let playbookDoc = getVerifiedPlaybook(profile.playbooks);
  if (!playbookDoc) {
    playbookDoc = getLatestLearningPlaybook(profile.playbooks);
  }
  if (!playbookDoc) {
    await enqueueRegistryDiscoveryJob({ stateCode, businessName, jobId }).catch(() => {});
    return buildSkippedResult('SOS_ONBOARDING', {
      businessName,
      state: stateCode,
      onboarding: true,
      alertCode: 'SOS_ONBOARDING'
    });
  }

  const playbook = resolvePlaybookMapping(playbookDoc, stateCode);
  if (!playbook) {
    return buildSkippedResult('SOS_ONBOARDING', {
      businessName,
      state: stateCode,
      onboarding: true,
      alertCode: 'SOS_ONBOARDING'
    });
  }

  if (isBrowserDisabled()) {
    return normalizeRegistryResult({
      businessName,
      stateCode,
      found: false,
      reason: 'BROWSER_DISABLED',
      playbookVersion: playbookDoc.version,
      accessTier,
      extra: { jobId, verificationAttempted: false }
    });
  }

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    const scrapeResult = await runPlaybook(page, playbook, businessName);
    if (scrapeResult.error) {
      const errMsg = scrapeResult.error;
      logger.error(`[REGISTRY] Playbook scrape error for ${stateCode}: ${errMsg}`);
      await recordPlaybookOutcome(stateCode, false, playbookDoc.version, errMsg);
      await enqueueRegistryRepairJob({
        stateCode,
        playbookVersion: playbookDoc.version,
        error: errMsg,
        businessName
      }).catch(() => {});
      return buildSkippedResult('SOS_VERIFICATION_ERROR', {
        businessName,
        state: stateCode,
        alertCode: 'SOS_VERIFICATION_ERROR',
        reason: errMsg,
        playbookVersion: playbookDoc.version,
        accessTier,
        verificationAttempted: false,
        jobId
      });
    }

    const interpreted = interpretScrapeResult(
      scrapeResult,
      businessName,
      playbook.matchRules || {}
    );

    const success = interpreted.found && !interpreted.error;
    await recordPlaybookOutcome(
      stateCode,
      success,
      playbookDoc.version,
      interpreted.error || scrapeResult.error || ''
    );

    if (!interpreted.found) {
      return normalizeRegistryResult({
        businessName,
        stateCode,
        found: false,
        reason: interpreted.message || interpreted.error || 'NOT_FOUND',
        playbookVersion: playbookDoc.version,
        accessTier,
        extra: { jobId }
      });
    }

    return normalizeRegistryResult({
      businessName,
      stateCode,
      found: true,
      status: interpreted.status,
      registrationDate: interpreted.registrationDate,
      matchedBusinessName: interpreted.matchedBusinessName,
      isActive: interpreted.isActive,
      playbookVersion: playbookDoc.version,
      accessTier,
      extra: { jobId, allResults: interpreted.allResults }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[REGISTRY] Verification failed for ${stateCode}: ${msg}`);
    await recordPlaybookOutcome(stateCode, false, playbookDoc.version, msg);
    await enqueueRegistryRepairJob({
      stateCode,
      playbookVersion: playbookDoc.version,
      error: msg,
      businessName
    }).catch(() => {});
    return buildSkippedResult('SOS_VERIFICATION_ERROR', {
      businessName,
      state: stateCode,
      alertCode: 'SOS_VERIFICATION_ERROR',
      reason: msg,
      playbookVersion: playbookDoc.version,
      accessTier,
      verificationAttempted: false,
      jobId
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

const businessRegistryOrchestrator = { verify: verifyBusinessRegistry, closeRegistryBrowser };

export default businessRegistryOrchestrator;
