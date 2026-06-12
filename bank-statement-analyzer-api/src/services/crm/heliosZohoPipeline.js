/**
 * Orchestrates Zoho CRM + WorkDrive sync after macro analysis (gated by DISABLE_ZOHO).
 */

import crypto from 'crypto';
import logger from '../../utils/logger.js';
import { getCrmAdapter } from './crmAdapterFactory.js';

const DISABLED = process.env.DISABLE_ZOHO === 'true';

function idempotencyKey(statementId, generatedAt) {
  const seed = `${statementId}:${generatedAt || ''}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function buildDealPatch(envelope, macroAgg) {
  const data = envelope?.data || envelope;
  const vera = data?.vera || {};
  const metrics = data?.metrics || macroAgg || {};
  const forensic = data?.forensicIntelligence || {};
  return {
    Veritas_Score: data?.veritasScore ?? data?.accountGroups?.[0]?.veritasScore ?? null,
    Bankability_Score: vera.bankabilityScore ?? null,
    Vera_Decision: vera.decision ?? null,
    NSF_Count: metrics.nsfCount ?? null,
    DSCR_Prospective: forensic?.dscr?.prospective ?? forensic?.prospectiveDscr ?? null,
    DSCR_Conservative: forensic?.dscr?.conservative ?? forensic?.conservativeDscr ?? null,
    L3M_Avg_Revenue: forensic?.l3m?.averageMonthlyRevenue ?? forensic?.l3mAvgRevenue ?? null,
    Average_Balance: metrics.averageDailyBalance ?? null
  };
}

/**
 * @param {object} params
 * @param {string} params.statementId
 * @param {string} [params.dealId]
 * @param {object} params.envelope 201 response
 * @param {Array} [params.alerts]
 */
export async function syncDealAnalysis({ statementId, dealId, envelope, alerts = [] }) {
  if (DISABLED) {
    return { skipped: true, reason: 'DISABLE_ZOHO' };
  }
  if (!dealId) {
    return { skipped: true, reason: 'no_deal_id' };
  }

  const data = envelope?.data || envelope;
  const vera = data?.vera || {};
  const generatedAt = vera.generatedAt || vera.metadata?.generatedAt || new Date().toISOString();
  const idem = idempotencyKey(statementId, generatedAt);

  const crm = getCrmAdapter();
  const results = { dealId, idempotencyKey: idem, steps: [] };
  const patch = buildDealPatch(envelope, data?.metrics);

  try {
    await crm.updateDealFields(dealId, patch);
    results.steps.push({ step: 'patch_deal', ok: true });
  } catch (e) {
    logger.warn(`[ZOHO_PIPELINE] PATCH deal failed: ${e.message}`);
    results.steps.push({ step: 'patch_deal', ok: false, error: e.message });
  }

  try {
    if (vera.briefingMarkdown) {
      await crm.addBriefingNote(
        dealId,
        vera.briefingMarkdown,
        `Vera Briefing — ${vera.decision || 'REVIEW'} [${idem.slice(0, 8)}]`
      );
      results.steps.push({ step: 'briefing_note', ok: true });
    }
  } catch (e) {
    logger.warn(`[ZOHO_PIPELINE] Briefing note failed: ${e.message}`);
    results.steps.push({ step: 'briefing_note', ok: false, error: e.message });
  }

  const critical = (alerts || []).filter((a) =>
    ['CRITICAL', 'HIGH'].includes(String(a.severity || '').toUpperCase())
  );
  if (critical.length > 0) {
    try {
      const note = crm.formatCriticalAlertsNote(critical, {
        fileName: data?.deal?.companyName,
        veritasScore: patch?.Veritas_Score,
        riskLevel: data?.riskLevel
      });
      await crm.addNoteToDeal(dealId, note, `Helios Alerts [${idem.slice(0, 8)}]`);
      results.steps.push({ step: 'alerts_note', ok: true });
    } catch (e) {
      results.steps.push({ step: 'alerts_note', ok: false, error: e.message });
    }
  }

  const stipulations = Array.isArray(vera.stipulations) ? vera.stipulations : [];
  for (let i = 0; i < stipulations.length; i++) {
    const text = typeof stipulations[i] === 'string' ? stipulations[i] : stipulations[i]?.text;
    if (!text) continue;
    try {
      await crm.createTaskInDeal(
        dealId,
        `Stipulation ${i + 1}: ${String(text).slice(0, 80)}`,
        text,
        'High'
      );
      results.steps.push({ step: `stip_task_${i}`, ok: true });
    } catch (e) {
      results.steps.push({ step: `stip_task_${i}`, ok: false, error: e.message });
    }
  }

  results.zohoDealUrl = `https://crm.zoho.com/crm/tab/Deals/${dealId}`;
  results.syncedAt = new Date().toISOString();
  return results;
}

export default { syncDealAnalysis };
