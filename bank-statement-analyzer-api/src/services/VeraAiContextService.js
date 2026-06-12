/**
 * Vera AI Context Service
 *
 * Builds business-specific context for the Vera underwriting assistant. The
 * primary context is the currently selected statement analysis; this service
 * augments it with:
 *  - Historical analyses for the same business (matched by companyName / taxId)
 *  - CRM data from Zoho (sales notes, deal stage, contact info) when in LIVE mode
 *
 * Falls back gracefully when CRM is unavailable or no history exists.
 */

import mongoose from 'mongoose';
import Statement from '../models/Statement.js';
import { isLiveMode } from '../config/appMode.js';
import logger from '../utils/logger.js';

/** Normalize dateRange / coverage to { startDate, endDate, daysCovered } with legacy start/end fallbacks. */
function normalizeCoverageForVera(dr) {
  if (!dr || typeof dr !== 'object') return null;
  const startRaw = dr.startDate ?? dr.start;
  const endRaw = dr.endDate ?? dr.end;
  if (!startRaw && !endRaw) return null;
  const toYmd = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  };
  const startDate = typeof startRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startRaw)
    ? startRaw
    : toYmd(startRaw);
  const endDate = typeof endRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endRaw)
    ? endRaw
    : toYmd(endRaw);
  const daysCovered = Number(dr.daysCovered ?? dr.days ?? 0) || 0;
  return { startDate, endDate, daysCovered };
}

const HISTORICAL_LIMIT = 5;

class VeraAiContextService {
  /**
   * Build a complete chat context object for a given statement.
   *
   * @param {Object} statement - The primary statement document (Mongoose or plain object).
   * @param {Object} options
   * @param {string|null} options.userId - Optional user id to scope historical lookups.
   * @returns {Promise<Object>} Context payload ready to be embedded in a Vera prompt.
   */
  async buildContext(statement, { userId = null } = {}) {
    if (!statement) {
      return { primary: null, historical: [], crm: null };
    }

    const primary = this._extractPrimaryContext(statement);

    // Resolve identity for historical / CRM lookups
    const companyName = statement.applicationContext?.companyName || null;
    const taxId = statement.applicationContext?.taxId || null;
    const dealId =
      statement.dealId ||
      statement.metadata?.dealId ||
      statement.applicationContext?.dealId ||
      null;

    // Fetch historical + CRM context in parallel; failures are non-fatal.
    const [historical, crm] = await Promise.all([
      this._fetchHistorical({ companyName, taxId, excludeId: statement._id, userId }).catch(
        (err) => {
          logger.warn(`[VERA_CONTEXT] Historical lookup failed: ${err.message}`);
          return [];
        }
      ),
      this._fetchCrm({ dealId }).catch((err) => {
        logger.warn(`[VERA_CONTEXT] CRM lookup failed: ${err.message}`);
        return null;
      })
    ]);

    return { primary, historical, crm };
  }

  /**
   * Reduce a statement document to the smallest forensic snapshot Vera needs.
   */
  _extractPrimaryContext(statement) {
    const firstGroup = statement.analysis?.accountGroups?.[0];
    const helios = firstGroup?.heliosAnalysis;
    const coveragePeriod =
      normalizeCoverageForVera(statement.coveragePeriod) ||
      normalizeCoverageForVera(
        statement.statementPeriodStart && statement.statementPeriodEnd
          ? { startDate: statement.statementPeriodStart, endDate: statement.statementPeriodEnd }
          : null
      ) ||
      normalizeCoverageForVera(firstGroup?.dateRange);

    return {
      companyName: statement.applicationContext?.companyName || null,
      taxId: statement.applicationContext?.taxId || null,
      industry: statement.applicationContext?.industry || null,
      requestedLoanAmount: statement.applicationContext?.requestedLoanAmount || null,
      statedAnnualRevenue:
        statement.applicationContext?.statedRevenue ||
        statement.applicationContext?.annualRevenue ||
        null,
      bankName: firstGroup?.bankName || statement.bankName || null,
      accountNumber: firstGroup?.accountNumber || statement.accountNumber || null,
      coveragePeriod,
      monthlyStatementSummaries: Array.isArray(statement.monthlyStatementSummaries)
        ? statement.monthlyStatementSummaries.slice(0, 24)
        : [],
      veritasScore: helios?.veritasScore?.score || statement.veritasScore || null,
      riskLevel: firstGroup?.riskLevel || statement.analysis?.overallRisk?.riskLevel || null,
      financialSummary: helios?.financialSummary || null,
      balanceAnalysis: helios?.balanceAnalysis || null,
      nsfAnalysis: helios?.nsfAnalysis || null,
      incomeStability: helios?.incomeStabilityAnalysis || null,
      alerts: Array.isArray(firstGroup?.alerts) ? firstGroup.alerts.slice(0, 10) : []
    };
  }

  /**
   * Find prior analyses for the same business. Skips when there's nothing to
   * match on (no companyName and no taxId).
   */
  async _fetchHistorical({ companyName, taxId, excludeId, userId }) {
    if (!companyName && !taxId) return [];

    const or = [];
    if (companyName) or.push({ 'applicationContext.companyName': companyName });
    if (taxId) or.push({ 'applicationContext.taxId': taxId });

    const query = { $or: or };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: excludeId };
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.user = new mongoose.Types.ObjectId(userId);
    }

    const docs = await Statement.find(query)
      .sort({ createdAt: -1 })
      .limit(HISTORICAL_LIMIT)
      .select('_id createdAt veritasScore riskScore analysis applicationContext bankName')
      .lean();

    return docs.map((d) => ({
      id: d._id,
      analyzedAt: d.createdAt,
      veritasScore: d.veritasScore || d.analysis?.accountGroups?.[0]?.veritasScore || null,
      riskLevel: d.analysis?.accountGroups?.[0]?.riskLevel || null,
      bankName: d.bankName || d.analysis?.accountGroups?.[0]?.bankName || null,
      requestedLoanAmount: d.applicationContext?.requestedLoanAmount || null,
      coveragePeriod:
        normalizeCoverageForVera(d.coveragePeriod) ||
        normalizeCoverageForVera(d.analysis?.accountGroups?.[0]?.dateRange) ||
        normalizeCoverageForVera(
          d.analytics?.statementPeriodStart && d.analytics?.statementPeriodEnd
            ? { startDate: d.analytics.statementPeriodStart, endDate: d.analytics.statementPeriodEnd }
            : null
        ),
      alertCount: Array.isArray(d.analysis?.accountGroups?.[0]?.alerts)
        ? d.analysis.accountGroups[0].alerts.length
        : 0
    }));
  }

  /**
   * Pull supporting CRM data from Zoho. Only runs in LIVE mode and when a
   * dealId is known. Returns null otherwise.
   */
  async _fetchCrm({ dealId }) {
    if (!dealId) return null;
    if (!isLiveMode()) return null;
    if ((process.env.DISABLE_ZOHO || '').toLowerCase() === 'true') return null;

    // Dynamic import keeps test environments where Zoho is disabled lightweight.
    const { default: ZohoCrmService } = await import('./crm/zoho.service.js');
    const zoho = new ZohoCrmService();
    if (zoho.disabled) return null;

    const deal = await zoho.getDeal(dealId);
    if (!deal) return null;

    return {
      dealId,
      stage: deal.Stage || null,
      owner: deal.Owner?.name || null,
      accountName: deal.Account_Name?.name || deal.Account_Name || null,
      amount: deal.Amount || null,
      closingDate: deal.Closing_Date || null,
      nextMeeting: deal.Next_Meeting || deal.Next_Step || null,
      lastActivity: deal.Last_Activity_Time || null,
      description: deal.Description || null
    };
  }
}

const veraAiContextService = new VeraAiContextService();
export { VeraAiContextService };
export default veraAiContextService;
