/**
 * Bank / institution enrichment (FDIC BankFind integration planned).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import mongoose from 'mongoose';
import InstitutionalProfile from '../models/InstitutionalProfile.js';
import { logStructured } from '../utils/structuredLog.js';
import {
  identityMethodRank,
  normalizeInstitutionName,
  WATERFALL_LEGAL_NAME_MIN_RANK
} from '../utils/identityMethodRank.js';
import { classifyInstitutionNamePair } from '../utils/institutionNameSimilarity.js';

const DEFAULT_INSTITUTION_LOGO_URL = 'https://cdn.example.com/default-bank-icon.png';
const MOCK_LEGAL_NAME = 'Mock National Bank';
const MAX_ALIASES = 50;

/**
 * @param {string[] | undefined} existing
 * @param {string[]} additions
 * @returns {string[]}
 */
function mergeAliasStrings(existing, additions) {
  const seen = new Set();
  const out = [];
  for (const x of existing || []) {
    const t = String(x || '').trim();
    if (!t) continue;
    const k = normalizeInstitutionName(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  for (const x of additions || []) {
    const t = String(x || '').trim();
    if (!t) continue;
    const k = normalizeInstitutionName(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_ALIASES) break;
  }
  return out.slice(0, MAX_ALIASES);
}

/**
 * Fingerprint of waterfall intent (before conflict resolution). Used to skip DB on repeats in one request.
 * @param {string} routingNumber
 * @param {string} legalNameChosen
 * @param {string} [identityMethod]
 * @param {string} [fdicCert]
 */
function buildIntentCacheKey(routingNumber, legalNameChosen, identityMethod, fdicCert) {
  return JSON.stringify({
    r: routingNumber,
    c: normalizeInstitutionName(legalNameChosen),
    m: String(identityMethod || ''),
    f: String(fdicCert ?? '')
  });
}

/**
 * @param {string} routingNumber
 * @param {{ legalName: string, fdicCert?: string, identityMethod?: string }} parts
 */
function buildProfileCacheSnapshot(routingNumber, parts) {
  return JSON.stringify({
    r: routingNumber,
    n: normalizeInstitutionName(parts.legalName),
    m: String(parts.identityMethod || ''),
    f: String(parts.fdicCert ?? '')
  });
}

/**
 * @param {Awaited<ReturnType<typeof enrichBankData>>} enriched
 * @param {{ bankName?: string, identityMethod?: string, bankNameConfidence?: string, sourceFile?: string }} [waterfallContext]
 */
function resolveLegalNameChosen(enriched, waterfallContext = {}) {
  const bankName =
    typeof waterfallContext.bankName === 'string' ? waterfallContext.bankName.trim() : '';
  const method = waterfallContext.identityMethod;
  if (
    bankName &&
    identityMethodRank(method) >= WATERFALL_LEGAL_NAME_MIN_RANK
  ) {
    return bankName;
  }
  return enriched.legalName;
}

/**
 * @param {{ legalName?: string } | null} preExisting
 * @param {string} legalNameChosen
 * @param {string} [identityMethod]
 */
function resolveLegalNameForWrite(preExisting, legalNameChosen, identityMethod) {
  if (!preExisting?.legalName) return legalNameChosen;
  const stored = preExisting.legalName;
  const normS = normalizeInstitutionName(stored);
  const normC = normalizeInstitutionName(legalNameChosen);
  if (normS === normC) return legalNameChosen;

  const incomingRank = identityMethodRank(identityMethod);
  const isMockStored = normS === normalizeInstitutionName(MOCK_LEGAL_NAME);
  if (incomingRank >= identityMethodRank('FDIC_COMPLIANCE_LOCK') && isMockStored) {
    return legalNameChosen;
  }
  return stored;
}

/**
 * Placeholder enrichment until FDIC BankFind is wired in.
 * @param {string} routingNumber
 * @returns {Promise<{
 *   routingNumber: string,
 *   legalName: string,
 *   fdicCert: string,
 *   hqAddress: string,
 *   status: string,
 *   website: string,
 *   logoUrl: string,
 *   socialLinks: { linkedin: string, twitter: string }
 * } | null>}
 */
export async function enrichBankData(routingNumber) {
  const cleaned = String(routingNumber ?? '').replace(/\D/g, '');
  if (cleaned.length !== 9) {
    return null;
  }
  return {
    routingNumber: cleaned,
    legalName: MOCK_LEGAL_NAME,
    fdicCert: `MOCK-FDIC-${cleaned.slice(-4)}`,
    hqAddress: '123 Mock Street, Washington, DC 20001',
    status: 'ACTIVE',
    website: 'https://www.mocknational.bank',
    logoUrl: 'https://cdn.example.com/mock-national-bank-logo.png',
    socialLinks: {
      linkedin: 'https://www.linkedin.com/company/mock-national-bank',
      twitter: ''
    }
  };
}

/**
 * Upsert by routing number from enrichment payload.
 * @param {Awaited<ReturnType<typeof enrichBankData>>} enriched
 * @param {{
 *   profileCache?: Map<string, { doc: unknown, snapshot: string, intentKey?: string }>,
 *   waterfallContext?: { bankName?: string, identityMethod?: string, bankNameConfidence?: string, sourceFile?: string },
 *   correlationId?: string
 * }} [options]
 */
export async function upsertInstitutionalProfile(enriched, options = {}) {
  if (!enriched?.routingNumber) return null;
  const correlationLog = options.correlationId ? { correlationId: options.correlationId } : {};

  if (mongoose.connection.readyState !== 1) {
    logStructured('warn', 'Skipping InstitutionalProfile upsert — MongoDB not connected', {
      routingNumber: enriched.routingNumber,
      ...correlationLog
    });
    return null;
  }

  const waterfallContext = options.waterfallContext || {};
  const wfMethod = waterfallContext.identityMethod || '';
  const legalNameChosen = resolveLegalNameChosen(enriched, waterfallContext);

  const cache = options.profileCache;
  const cacheKey = enriched.routingNumber;
  const intentKey = buildIntentCacheKey(
    enriched.routingNumber,
    legalNameChosen,
    wfMethod,
    enriched.fdicCert
  );
  if (cache?.has(cacheKey)) {
    const hit = cache.get(cacheKey);
    if (hit?.intentKey === intentKey) {
      return hit.doc;
    }
  }

  const preExisting = await InstitutionalProfile.findOne({ routingNumber: enriched.routingNumber })
    .select('_id legalName aliases')
    .lean();
  const isFirstDiscovery = !preExisting;

  const legalNameForWrite = resolveLegalNameForWrite(
    preExisting,
    legalNameChosen,
    wfMethod
  );

  const snapshot = buildProfileCacheSnapshot(enriched.routingNumber, {
    legalName: legalNameForWrite,
    fdicCert: enriched.fdicCert,
    identityMethod: wfMethod
  });

  if (preExisting) {
    const normDiffers =
      normalizeInstitutionName(preExisting.legalName || '') !==
      normalizeInstitutionName(legalNameChosen || '');
    if (normDiffers) {
      const pair = classifyInstitutionNamePair(preExisting.legalName || '', legalNameChosen || '');
      const base = {
        domain: 'institution-triage',
        routingNumber: enriched.routingNumber,
        storedLegalName: preExisting.legalName,
        incomingLegalName: legalNameChosen,
        identityMethod: wfMethod || null,
        incomingRank: identityMethodRank(wfMethod),
        sourceFile: waterfallContext.sourceFile || null,
        institutionalProfileId: preExisting._id?.toString?.(),
        legalNameApplied: legalNameForWrite,
        matchTier: pair.tier,
        similarityScore: pair.score,
        ...correlationLog
      };
      if (pair.tier === 'hard') {
        logStructured('warn', '[INSTITUTION_NAME_CONFLICT] Waterfall name differs from profile legalName', base);
      } else {
        logStructured(
          'info',
          '[INSTITUTION_NAME_NEAR_MATCH] Waterfall name soft match with profile legalName',
          base
        );
      }
    }
  }

  const additions = [];
  const chosenTrim = String(legalNameChosen || '').trim();
  if (chosenTrim && normalizeInstitutionName(chosenTrim) !== normalizeInstitutionName(legalNameForWrite)) {
    additions.push(chosenTrim);
  }
  const wb = String(waterfallContext.bankName || '').trim();
  if (
    wb &&
    normalizeInstitutionName(wb) !== normalizeInstitutionName(legalNameForWrite) &&
    normalizeInstitutionName(wb) !== normalizeInstitutionName(chosenTrim)
  ) {
    additions.push(wb);
  }
  const mergedAliases = mergeAliasStrings(preExisting?.aliases, additions);

  const now = new Date();
  const socialLinks = {
    linkedin: enriched.socialLinks?.linkedin ?? '',
    twitter: enriched.socialLinks?.twitter ?? ''
  };

  const doc = await InstitutionalProfile.findOneAndUpdate(
    { routingNumber: enriched.routingNumber },
    {
      $set: {
        legalName: legalNameForWrite,
        fdicCert: enriched.fdicCert ?? '',
        hqAddress: enriched.hqAddress ?? '',
        status: enriched.status ?? 'PENDING',
        website: enriched.website ?? '',
        logoUrl: enriched.logoUrl ?? DEFAULT_INSTITUTION_LOGO_URL,
        socialLinks,
        lastEnrichedAt: now,
        aliases: mergedAliases
      },
      $setOnInsert: {
        routingNumber: enriched.routingNumber,
        templates: []
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  if (cache) {
    cache.set(cacheKey, { doc, snapshot, intentKey });
  }

  const fdicCert = enriched.fdicCert ?? '';
  const meta = {
    routingNumber: enriched.routingNumber,
    legalName: legalNameForWrite,
    fdicCert,
    institutionalProfileId: doc?._id?.toString?.(),
    isFirstDiscovery,
    ...correlationLog
  };

  if (isFirstDiscovery) {
    logStructured(
      'info',
      `[INSTITUTION_DISCOVERY] New bank added to library: ${legalNameForWrite}`,
      meta
    );
  } else {
    logStructured(
      'info',
      `[INSTITUTION_TRIAGE] Linked statement to existing profile: ${enriched.routingNumber}`,
      meta
    );
  }

  if (isFirstDiscovery && doc?._id) {
    const { maybeScheduleInstitutionBrandingEnrichment } = await import('./institutionBrandingEnrichment.js');
    maybeScheduleInstitutionBrandingEnrichment({
      profileId: String(doc._id),
      website: enriched.website,
      logoUrl: enriched.logoUrl,
      correlationId: options.correlationId
    });
  }

  return doc;
}

/**
 * Enrich then upsert; returns the profile document or null.
 * @param {string} routingNumber
 * @param {{
 *   profileCache?: Map<string, { doc: unknown, snapshot: string, intentKey?: string }>,
 *   waterfallContext?: { bankName?: string, identityMethod?: string, bankNameConfidence?: string, sourceFile?: string },
 *   correlationId?: string
 * }} [options]
 */
export async function ensureInstitutionalProfileForRtn(routingNumber, options = {}) {
  const enriched = await enrichBankData(routingNumber);
  if (!enriched) return null;
  return upsertInstitutionalProfile(enriched, options);
}