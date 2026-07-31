/**
 * Section-scoped AI rescue — identify which SECTION caused the checksum failure
 * and scope AI rescue to only that section for cost-efficient diagnosis.
 *
 * P3 of the Helios Engine multi-pass pipeline.
 * Depends on P2: sectionBoundaryDetector.js for section detection.
 */

import { detectSectionBoundaries, extractSectionText } from './extraction/sectionBoundaryDetector.js';

/**
 * Given parsed transactions + reconciliation result, identify which section is wrong.
 *
 * PURE function — no DB, no API calls, testable in isolation.
 *
 * @param {object} params
 * @param {Array<object>} params.transactions - parsed transactions with sectionId/section
 * @param {Array<string>} params.sectionLabels - section label strings from the statement
 * @param {object} params.checksumRecon - reconciliation result { ok, deposits, withdrawals, computedClosing, closing, delta }
 * @param {string} params.fullText - raw extracted text from the statement
 * @returns {{ failingSection: string|null, sectionDelta: number, confidence: number, recommendedAction: string, sectionType: string, transactionCount: number }}
 */
export function identifyFailingSection({ transactions, sectionLabels, checksumRecon, fullText }) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      failingSection: null, sectionDelta: 0, confidence: 0,
      recommendedAction: 'full_rescan', sectionType: 'unknown', transactionCount: 0
    };
  }

  // 1. Compute per-section totals
  const sectionTotals = {};
  const labels = Array.isArray(sectionLabels) ? sectionLabels : [];

  for (const section of labels) {
    const sectionTxs = transactions.filter(t =>
      (t.sectionId === section || t.section === section)
    );
    sectionTotals[section] = {
      deposits: sectionTxs
        .filter(t => (t.type === 'deposit' || t.amount > 0))
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
      withdrawals: sectionTxs
        .filter(t => (t.type === 'withdrawal' || t.amount < 0))
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
      count: sectionTxs.length
    };
  }

  // 2. Build weighted discrepancies
  const discrepancies = [];
  for (const [label, totals] of Object.entries(sectionTotals)) {
    const weight = totals.count / Math.max(1, transactions.length);
    discrepancies.push({ label, weight, ...totals });
  }

  // 3. Sort by weight — the section with most transactions is most likely the source
  discrepancies.sort((a, b) => b.weight - a.weight);

  const top = discrepancies[0];
  if (!top || top.count === 0) {
    return {
      failingSection: null, sectionDelta: 0, confidence: 0,
      recommendedAction: 'full_rescan', sectionType: 'unknown', transactionCount: 0
    };
  }

  // 4. Map section label to transaction type
  const sectionMap = {
    deposits: 'deposits', withdrawals: 'withdrawals',
    checks: 'withdrawals', fees: 'withdrawals'
  };
  const sectionType = sectionMap[top.label?.toLowerCase()] || 'unknown';

  return {
    failingSection: top.label,
    sectionDelta: Math.abs(checksumRecon?.delta || 0),
    confidence: Math.min(0.9, top.weight),
    recommendedAction: top.weight > 0.4 ? 'section_rescue' : 'full_rescan',
    sectionType,
    transactionCount: top.count
  };
}

/**
 * Extract only the failing section's text for AI rescue.
 * Sends MINIMAL context to the AI — just the section that broke.
 *
 * @param {string} fullText - raw extracted text from the statement
 * @param {string} sectionLabel - label of the failing section
 * @param {Array<object>} [sectionBoundaries] - pre-computed boundaries from detectSectionBoundaries.
 *   If omitted, boundaries are detected internally.
 * @returns {string} — scoped text for the failing section, or truncated fullText as fallback
 */
export function extractFailingSectionContext(fullText, sectionLabel, sectionBoundaries) {
  const boundaries = Array.isArray(sectionBoundaries) && sectionBoundaries.length > 0
    ? sectionBoundaries
    : detectSectionBoundaries(fullText);

  const section = boundaries.find(s => s.label === sectionLabel);
  if (!section) {
    // Fallback: return first 4000 chars of full text
    return String(fullText || '').slice(0, 4000);
  }

  return extractSectionText(fullText, section);
}

export default { identifyFailingSection, extractFailingSectionContext };
