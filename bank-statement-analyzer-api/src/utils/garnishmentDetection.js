/**
 * Rule-based garnishment / levy detection from transaction descriptions.
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { isLedgerOutflow } from './transactionNormalization.js';

const CHILD_SUPPORT_PATTERNS = [
  /child\s*supp?(ort)?/i,
  /chld\s*sup/i,
  /\bcse\b/i,
  /support\s+enforcement/i,
  /state\s+disbursement/i,
  /\bsdu\b/i,
  /county\b.*(child|support|dcss)/i,
  /\bdcss\b/i
];

const TAX_LEVY_PATTERNS = [
  /tax\s*lev(y|ies)/i,
  /\birs\b.*(levy|lien)/i,
  /franchise\s+tax\s+board|\bftb\b.*(levy|lien)/i,
  /\bedd\b.*(levy|lien)/i,
  /state\s+tax\s+(levy|lien)/i
];

const WAGE_GARNISHMENT_PATTERNS = [
  /garnish/i,
  /wage\s+(attach|assign)/i,
  /writ\s+of\s+garnishment/i,
  /legal\s+order\s+(debit|fee|processing)/i,
  /\blevy\b/i
];

/**
 * @param {string|null|undefined} description
 * @returns {'CHILD_SUPPORT_GARNISHMENT'|'TAX_LEVY_DETECTED'|'WAGE_GARNISHMENT_DETECTED'|null}
 */
export function classifyGarnishment(description) {
  const text = String(description || '').trim();
  if (!text) return null;

  if (CHILD_SUPPORT_PATTERNS.some((re) => re.test(text))) {
    return 'CHILD_SUPPORT_GARNISHMENT';
  }
  if (TAX_LEVY_PATTERNS.some((re) => re.test(text))) {
    return 'TAX_LEVY_DETECTED';
  }
  if (WAGE_GARNISHMENT_PATTERNS.some((re) => re.test(text))) {
    return 'WAGE_GARNISHMENT_DETECTED';
  }
  return null;
}

/**
 * @param {Array<object>} transactions
 * @returns {{ flags: Array<{ code: string, count: number, totalAmount: number, examples: object[] }>, hasGarnishment: boolean }}
 */
export function detectGarnishments(transactions) {
  const buckets = new Map();

  for (const tx of transactions || []) {
    if (!tx || !isLedgerOutflow(tx)) continue;
    const code = classifyGarnishment(tx.description || tx.memo || tx.name || '');
    if (!code) continue;

    const amount = Math.abs(Number(tx.amount) || 0);
    const entry = buckets.get(code) || { code, count: 0, totalAmount: 0, examples: [] };
    entry.count += 1;
    entry.totalAmount += amount;
    if (entry.examples.length < 5) {
      entry.examples.push({
        date: tx.date,
        description: tx.description || tx.memo || tx.name || '',
        amount: tx.amount
      });
    }
    buckets.set(code, entry);
  }

  const flags = [...buckets.values()];
  return { flags, hasGarnishment: flags.length > 0 };
}
