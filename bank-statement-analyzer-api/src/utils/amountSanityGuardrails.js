/**
 * Amount sanity guardrails — prevent parsing bleed (RTN/account/tax ID as amounts, absurd OCR).
 */

import logger from './logger.js';
import { pickNumeric } from './financialValidation.js';

const DEFAULT_ABSURDITY = 5_000_000;

export function getAbsurdityThreshold() {
  const n = Number(process.env.ABSURDITY_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ABSURDITY;
}

export function getImplicitCentsMax() {
  const n = Number(process.env.AMOUNT_IMPLICIT_CENTS_MAX);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {object} sources
 * @returns {{ forbiddenDigitStrings: string[], rtn9: string|null, accountDigits: string|null, taxId9: string|null }}
 */
export function buildDealIdentity(sources = {}) {
  const forbidden = new Set();
  const add = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return;
    if (d.length >= 4) forbidden.add(d);
    if (d.length === 9) forbidden.add(d);
  };

  add(sources.rtn);
  add(sources.routingNumber);
  add(sources.accountNumber);
  add(sources.taxId);
  add(sources.ein);
  add(sources.extractedAnchorData?.taxId);
  add(sources.applicationData?.taxId);
  add(sources.parseResult?.rtn);
  add(sources.parseResult?.metadata?.rtn);
  add(sources.parseResult?.accountInfo?.accountNumber);
  add(sources.parseResult?.accountNumber);

  const rtn9 =
    String(sources.rtn || sources.parseResult?.rtn || sources.parseResult?.metadata?.rtn || '')
      .replace(/\D/g, '')
      .slice(0, 9) || null;
  const accountDigits = String(
    sources.accountNumber || sources.parseResult?.accountInfo?.accountNumber || ''
  ).replace(/\D/g, '');
  const taxId9 = String(
    sources.taxId || sources.extractedAnchorData?.taxId || sources.applicationData?.taxId || ''
  ).replace(/\D/g, '');

  if (rtn9?.length === 9) forbidden.add(rtn9);
  if (accountDigits.length >= 4) forbidden.add(accountDigits);
  if (taxId9.length === 9) forbidden.add(taxId9);

  return {
    forbiddenDigitStrings: [...forbidden],
    rtn9: rtn9?.length === 9 ? rtn9 : null,
    accountDigits: accountDigits || null,
    taxId9: taxId9.length === 9 ? taxId9 : null
  };
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function matchesForbiddenIdentity(amount, description, rawAmountToken, identity) {
  const probes = [
    digitsOnly(rawAmountToken),
    digitsOnly(amount),
    digitsOnly(description)
  ].filter(Boolean);

  for (const probe of probes) {
    for (const forbidden of identity.forbiddenDigitStrings) {
      if (probe === forbidden) return true;
      if (forbidden.length >= 9 && probe.length >= 9 && probe.endsWith(forbidden)) return true;
    }
  }
  return false;
}

/**
 * Validate and optionally scale ambiguous integer tokens (cents heuristic).
 * @returns {{ amount: number|null, reason?: string, implicitCents?: boolean }}
 */
function resolveAmountValue(tx, options) {
  const absurdity = options.absurdityThreshold ?? getAbsurdityThreshold();
  const implicitCentsMax = options.implicitCentsMax ?? getImplicitCentsMax();
  const rawToken = tx.rawAmount ?? tx.amountRaw ?? tx._rawAmount ?? null;

  if (rawToken != null && String(rawToken).trim() !== '') {
    const picked = pickNumeric(rawToken, {
      maxAmount: absurdity,
      allowNegative: true,
      strictDecimal: true
    });
    if (picked != null) return { amount: picked };
    if (implicitCentsMax > 0) {
      const bare = String(rawToken).replace(/[,$\s]/g, '');
      if (/^\d+$/.test(bare)) {
        const n = parseInt(bare, 10);
        if (Number.isFinite(n) && n > 0 && n <= implicitCentsMax) {
          return { amount: Math.round((n / 100) * 100) / 100, implicitCents: true };
        }
      }
    }
    return { amount: null, reason: 'NO_DECIMAL' };
  }

  const num = Number(tx.amount);
  if (!Number.isFinite(num)) return { amount: null, reason: 'INVALID_AMOUNT' };

  if (Math.abs(num) > absurdity) {
    return { amount: null, reason: 'ABSURDITY_CEILING' };
  }

  const rounded = Math.round(num * 100) / 100;
  if (Math.abs(num - rounded) <= 0.001) {
    return { amount: rounded };
  }

  const asStr = String(tx.amount);
  if (asStr.includes('.')) {
    const dec = asStr.split('.')[1];
    if (!dec || dec.length !== 2) return { amount: null, reason: 'NO_DECIMAL' };
    return { amount: num };
  }

  if (implicitCentsMax > 0 && Math.abs(num) <= implicitCentsMax && Number.isInteger(num)) {
    return { amount: Math.round((num / 100) * 100) / 100, implicitCents: true };
  }

  return { amount: null, reason: 'NO_DECIMAL' };
}

/**
 * @param {Array<object>} transactions
 * @param {object} dealIdentity from buildDealIdentity
 * @param {object} [options]
 * @returns {{ accepted: object[], rejected: object[], stats: object }}
 */
export function sanitizeTransactionsForMacro(transactions, dealIdentity = {}, options = {}) {
  const absurdity = options.absurdityThreshold ?? getAbsurdityThreshold();
  const stats = {
    inputCount: 0,
    acceptedCount: 0,
    rejectedIdentity: 0,
    rejectedNoDecimal: 0,
    rejectedAbsurdity: 0,
    rejectedInvalid: 0,
    implicitCentsApplied: 0
  };

  if (!Array.isArray(transactions)) {
    return { accepted: [], rejected: [], stats };
  }

  const accepted = [];
  const rejected = [];

  for (const tx of transactions) {
    stats.inputCount += 1;
    if (!tx || typeof tx !== 'object') {
      stats.rejectedInvalid += 1;
      rejected.push({ tx, parseRejectReason: 'INVALID_ROW' });
      continue;
    }

    if (matchesForbiddenIdentity(tx.amount, tx.description, tx.rawAmount, dealIdentity)) {
      stats.rejectedIdentity += 1;
      rejected.push({
        ...tx,
        parseConfidence: 'LOW',
        parseExcluded: true,
        parseRejectReason: 'IDENTITY_MATCH'
      });
      continue;
    }

    const resolved = resolveAmountValue(tx, {
      absurdityThreshold: absurdity,
      implicitCentsMax: options.implicitCentsMax ?? getImplicitCentsMax()
    });

    if (resolved.amount == null) {
      if (resolved.reason === 'ABSURDITY_CEILING') stats.rejectedAbsurdity += 1;
      else if (resolved.reason === 'NO_DECIMAL') stats.rejectedNoDecimal += 1;
      else stats.rejectedInvalid += 1;
      rejected.push({
        ...tx,
        parseConfidence: 'LOW',
        parseExcluded: true,
        parseRejectReason: resolved.reason || 'INVALID_AMOUNT'
      });
      logger.debug('[AMOUNT_SANITY] rejected txn', {
        reason: resolved.reason,
        description: String(tx.description || '').slice(0, 60),
        amount: tx.amount
      });
      continue;
    }

    if (Math.abs(resolved.amount) > absurdity) {
      stats.rejectedAbsurdity += 1;
      rejected.push({
        ...tx,
        parseConfidence: 'LOW',
        parseExcluded: true,
        parseRejectReason: 'ABSURDITY_CEILING'
      });
      logger.warn('[AMOUNT_SANITY] ABSURDITY_CEILING', {
        amount: resolved.amount,
        threshold: absurdity,
        description: String(tx.description || '').slice(0, 80)
      });
      continue;
    }

    if (resolved.implicitCents) stats.implicitCentsApplied += 1;

    const confidence = resolved.implicitCents ? 'LOW' : 'HIGH';
    accepted.push({
      ...tx,
      amount: resolved.amount,
      parseConfidence: confidence,
      parseExcluded: false,
      parseRejectReason: null
    });
    stats.acceptedCount += 1;
  }

  if (stats.rejectedAbsurdity > 0 || stats.rejectedIdentity > 0) {
    logger.info('[AMOUNT_SANITY] sanitize summary', stats);
  }

  return { accepted, rejected, stats };
}

export function buildParsingBleedAlert(stats) {
  const totalRejected =
    (stats.rejectedIdentity || 0) +
    (stats.rejectedNoDecimal || 0) +
    (stats.rejectedAbsurdity || 0) +
    (stats.rejectedInvalid || 0);
  if (totalRejected === 0) return null;
  const pct =
    stats.inputCount > 0 ? ((totalRejected / stats.inputCount) * 100).toFixed(1) : '0';
  return {
    code: 'PARSING_BLEED_DETECTED',
    type: 'PATTERN',
    severity: stats.rejectedAbsurdity > 0 ? 'HIGH' : 'MEDIUM',
    title: 'Parsing bleed: suspicious amounts excluded',
    message: `${totalRejected} transaction row(s) excluded (${pct}% of raw parse) — identity digits, missing decimals, or absurd amounts.`,
    recommendation: 'Review excluded rows in parse metadata; confirm statement PDF layout or re-run with Gemini template.',
    data: { ...stats }
  };
}

export default {
  sanitizeTransactionsForMacro,
  buildDealIdentity,
  buildParsingBleedAlert,
  getAbsurdityThreshold,
  getImplicitCentsMax
};
