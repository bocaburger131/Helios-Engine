/**
 * Non-blocking institution website/logo enrichment (Clearbit logo when domain is known).
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import axios from 'axios';
import mongoose from 'mongoose';
import { logStructured } from '../utils/structuredLog.js';

export const DEFAULT_INSTITUTION_LOGO_URL = 'https://cdn.example.com/default-bank-icon.png';

function brandingEnabled() {
  return String(process.env.ENABLE_INSTITUTION_BRANDING_ENRICHMENT || '').toLowerCase() === 'true';
}

function extractHostname(website) {
  const w = String(website || '').trim();
  if (!w) return null;
  try {
    const u = new URL(w.startsWith('http') ? w : `https://${w}`);
    return u.hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/**
 * @param {{ profileId: string, website?: string, logoUrl?: string, correlationId?: string }} params
 */
export function maybeScheduleInstitutionBrandingEnrichment(params) {
  if (!brandingEnabled()) return;
  const { profileId, website, logoUrl, correlationId } = params;
  if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) return;

  const host = extractHostname(website);
  const logoIsDefault =
    !logoUrl ||
    String(logoUrl).trim() === DEFAULT_INSTITUTION_LOGO_URL ||
    String(logoUrl).includes('default-bank-icon');
  if (!host || !logoIsDefault) return;

  const clearbitUrl = `https://logo.clearbit.com/${encodeURIComponent(host)}`;

  setImmediate(() => {
    void (async () => {
      try {
        const { default: InstitutionalProfile } = await import('../models/InstitutionalProfile.js');
        const get = await axios.get(clearbitUrl, {
          responseType: 'arraybuffer',
          maxContentLength: 100_000,
          timeout: 8000,
          validateStatus: (s) => s === 200
        });
        if (get.status !== 200 || !get.data || get.data.byteLength < 32) return;

        const siteUrl = `https://${host}`;
        const res = await InstitutionalProfile.updateOne(
          { _id: profileId, logoUrl: DEFAULT_INSTITUTION_LOGO_URL },
          { $set: { logoUrl: clearbitUrl, website: siteUrl, lastEnrichedAt: new Date() } }
        );
        if (res.modifiedCount > 0) {
          logStructured('info', '[INSTITUTION_BRANDING] Applied Clearbit logo from domain', {
            domain: 'institution-branding',
            institutionalProfileId: profileId,
            hostname: host,
            logoUrl: clearbitUrl,
            correlationId: correlationId || null
          });
        }
      } catch (e) {
        logStructured('warn', '[INSTITUTION_BRANDING] Clearbit logo fetch skipped or failed', {
          domain: 'institution-branding',
          institutionalProfileId: profileId,
          hostname: host,
          correlationId: correlationId || null,
          error: e.message
        });
      }
    })();
  });
}
