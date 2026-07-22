/**
 * Extract fee / service charge rows from fee ledger region text.
 */

const FEE_LINE_RE =
  /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/im;

const FEE_CATEGORY_RULES = [
  { re: /nsf|non.?sufficient|returned item/i, category: 'NSF' },
  { re: /overdraft|od fee/i, category: 'Overdraft' },
  { re: /service charge|monthly fee|maintenance/i, category: 'Service Charge' },
  { re: /wire|ach fee|transfer fee/i, category: 'Transfer Fee' }
];

function categorizeFee(description) {
  for (const { re, category } of FEE_CATEGORY_RULES) {
    if (re.test(description)) return category;
  }
  return 'Other Fee';
}

function parseAmount(raw) {
  const n = Number(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/**
 * @param {string} feeText
 * @param {object} [opts]
 * @returns {Array<object>}
 */
export function extractFeeLedgerTransactions(feeText, opts = {}) {
  const text = String(feeText || '').trim();
  if (!text) return [];

  const year = opts.defaultYear ?? new Date().getFullYear();
  const rows = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 8) continue;
    const m = trimmed.match(FEE_LINE_RE);
    if (!m) continue;

    const amount = parseAmount(m[3]);
    if (amount == null) continue;

    let dateStr = m[1];
    if (!/\d{4}/.test(dateStr)) {
      const parts = dateStr.split('/');
      if (parts.length >= 2) {
        dateStr = `${year}-${String(parts[0]).padStart(2, '0')}-${String(parts[1]).padStart(2, '0')}`;
      }
    }

    const description = m[2].trim();
    rows.push({
      date: dateStr,
      description,
      amount,
      type: 'DEBIT',
      category: categorizeFee(description),
      isFee: true,
      pageIndex: opts.pageIndex ?? null
    });
  }

  return rows;
}

/**
 * @param {Array<object>} feeTxns
 * @param {Array<object>} mainTxns
 * @returns {Array<object>}
 */
export function dedupeFeeTransactions(feeTxns, mainTxns = []) {
  const keys = new Set(
    (mainTxns || []).map((t) => `${t.date}|${t.amount}|${(t.description || '').slice(0, 20)}`)
  );
  return (feeTxns || []).filter((f) => {
    const k = `${f.date}|${f.amount}|${(f.description || '').slice(0, 20)}`;
    return !keys.has(k);
  });
}

export default { extractFeeLedgerTransactions, dedupeFeeTransactions };
