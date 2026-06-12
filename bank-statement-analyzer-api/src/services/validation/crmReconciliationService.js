/**
 * Compare parsed application data against CRM deal records; merge or flag conflicts.
 * Never throws on mismatch — injects DATA_CONFLICT for Vera / manual review.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { normalizeEin, parseCurrency } from '../../schemas/parsedApplication.schema.js';

/** @typedef {'MANUAL_VERIFICATION_REQUIRED'} ConflictSeverity */

/**
 * @typedef {Object} DataConflict
 * @property {string} field
 * @property {string|number|null} applicationValue
 * @property {string|number|null} crmValue
 * @property {ConflictSeverity} severity
 * @property {string} message
 */

/**
 * @typedef {Object} ReconciliationResult
 * @property {Object} dealContext
 * @property {DataConflict[]} DATA_CONFLICT
 * @property {boolean} reconciled
 */

const AMOUNT_TOLERANCE = 1;
const REVENUE_TOLERANCE_PCT = 0.01;
const REVENUE_TOLERANCE_ABS = 500;

/**
 * @param {object} params
 * @param {object|null} params.application
 * @param {object|null} params.crmDeal
 * @param {string} [params.dealId]
 * @returns {ReconciliationResult}
 */
export function reconcileApplicationWithCrm({ application, crmDeal, dealId = null }) {
  const app = normalizeApplicationSide(application);
  const crm = normalizeCrmSide(crmDeal);
  const DATA_CONFLICT = [];

  compareField(DATA_CONFLICT, 'ein', app.ein, crm.ein, exactStringCompare);
  compareField(DATA_CONFLICT, 'dbaName', app.dbaName, crm.dbaName, fuzzyNameCompare);
  compareField(DATA_CONFLICT, 'legalName', app.legalName, crm.legalName, fuzzyNameCompare);
  compareField(
    DATA_CONFLICT,
    'requestedAmount',
    app.requestedAmount,
    crm.requestedAmount,
    amountCompare
  );
  compareField(
    DATA_CONFLICT,
    'grossAnnualRevenue',
    app.grossAnnualRevenue,
    crm.grossAnnualRevenue,
    revenueCompare
  );

  const dealContext = mergeDealContext(app, crm, dealId);

  return {
    dealContext,
    DATA_CONFLICT,
    reconciled: DATA_CONFLICT.length === 0
  };
}

function normalizeApplicationSide(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      legalName: null,
      dbaName: null,
      ein: null,
      requestedAmount: null,
      grossAnnualRevenue: null
    };
  }
  return {
    legalName: cleanStr(raw.legalName || raw.companyName),
    dbaName: cleanStr(raw.dbaName),
    ein: normalizeEin(raw.ein || raw.taxId),
    requestedAmount: parseCurrency(raw.requestedAmount ?? raw.requestedLoanAmount),
    grossAnnualRevenue: parseCurrency(
      raw.grossAnnualRevenue ?? raw.annualRevenue ?? raw.statedRevenue
    )
  };
}

function normalizeCrmSide(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      legalName: null,
      dbaName: null,
      ein: null,
      requestedAmount: null,
      grossAnnualRevenue: null,
      dealId: null,
      ownerName: null,
      email: null,
      phoneNumber: null,
      industry: null,
      notes: []
    };
  }
  return {
    legalName: cleanStr(raw.legalName || raw.companyName || raw.Deal_Name),
    dbaName: cleanStr(raw.dbaName || raw.DBA),
    ein: normalizeEin(raw.ein || raw.taxId || raw.EIN || raw.Tax_ID),
    requestedAmount: parseCurrency(raw.requestedAmount ?? raw.Amount),
    grossAnnualRevenue: parseCurrency(
      raw.grossAnnualRevenue ?? raw.Annual_Revenue ?? raw.Stated_Annual_Revenue
    ),
    dealId: raw.dealId || raw.id || null,
    ownerName: cleanStr(raw.ownerName || raw.Contact_Name?.name),
    email: cleanStr(raw.email || raw.Email),
    phoneNumber: cleanStr(raw.phoneNumber || raw.Phone),
    industry: cleanStr(raw.industry || raw.Industry),
    notes: Array.isArray(raw.notes) ? raw.notes : []
  };
}

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function compareField(conflicts, field, appVal, crmVal, comparator) {
  if (appVal == null || crmVal == null) return;
  if (comparator(appVal, crmVal)) return;

  conflicts.push({
    field,
    applicationValue: appVal,
    crmValue: crmVal,
    severity: 'MANUAL_VERIFICATION_REQUIRED',
    message: `${field} mismatch: application="${appVal}" vs CRM="${crmVal}"`
  });
}

function exactStringCompare(a, b) {
  const na = String(a).replace(/\D/g, '');
  const nb = String(b).replace(/\D/g, '');
  return na === nb;
}

function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyNameCompare(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function amountCompare(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return true;
  return Math.abs(na - nb) <= AMOUNT_TOLERANCE;
}

function revenueCompare(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return true;
  const diff = Math.abs(na - nb);
  const pct = diff / Math.max(Math.abs(nb), 1);
  return diff <= REVENUE_TOLERANCE_ABS || pct <= REVENUE_TOLERANCE_PCT;
}

function mergeDealContext(app, crm, dealId) {
  const pick = (appVal, crmVal) => appVal ?? crmVal ?? null;

  return {
    dealId: dealId || crm.dealId || null,
    correlationId: dealId || crm.dealId || null,
    legalName: pick(app.legalName, crm.legalName),
    dbaName: pick(app.dbaName, crm.dbaName),
    companyName: pick(app.legalName, crm.legalName),
    ein: pick(app.ein, crm.ein),
    taxId: (pick(app.ein, crm.ein) || '').replace(/-/g, '') || null,
    requestedAmount: pick(app.requestedAmount, crm.requestedAmount),
    requestedLoanAmount: pick(app.requestedAmount, crm.requestedAmount),
    grossAnnualRevenue: pick(app.grossAnnualRevenue, crm.grossAnnualRevenue),
    statedRevenue: pick(app.grossAnnualRevenue, crm.grossAnnualRevenue),
    annualRevenue: pick(app.grossAnnualRevenue, crm.grossAnnualRevenue),
    ownerName: crm.ownerName,
    email: crm.email,
    phoneNumber: crm.phoneNumber,
    industry: crm.industry,
    crmNotes: crm.notes,
    sources: {
      application: app,
      crm: crm
    }
  };
}

/**
 * @param {DataConflict[]} conflicts
 */
export function dataConflictsToAlerts(conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return [];
  return conflicts.map((c, i) => ({
    code: 'DATA_CONFLICT',
    severity: 'MEDIUM',
    title: `Manual Verification Required: ${c.field}`,
    message: c.message,
    field: c.field,
    applicationValue: c.applicationValue,
    crmValue: c.crmValue,
    id: `data-conflict-${i + 1}`
  }));
}

export default { reconcileApplicationWithCrm, dataConflictsToAlerts };
