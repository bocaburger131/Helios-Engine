import crypto from 'crypto';

/** Canonical macro bank labels — merges variant legal names into one group key. */
const MACRO_BANK_ALIASES = [
  { pattern: /j\s*p\s*morgan\s+chase|jpmorgan\s+chase/i, canonical: 'CHASE' },
  { pattern: /^chase\s+bank\b|^chase$/i, canonical: 'CHASE' },
  { pattern: /wells\s+fargo/i, canonical: 'WELLS FARGO' },
  { pattern: /bank\s+of\s+america/i, canonical: 'BANK OF AMERICA' },
  { pattern: /regions\s+bank/i, canonical: 'REGIONS BANK' }
];

/**
 * Normalize bank name for macro STAGE 3 account grouping.
 * @param {string} [name]
 * @returns {string}
 */
export function normalizeBankNameForMacro(name) {
  if (!name || typeof name !== 'string') return 'UNKNOWN';
  const trimmed = name.trim();
  for (const { pattern, canonical } of MACRO_BANK_ALIASES) {
    if (pattern.test(trimmed)) return canonical;
  }
  return trimmed.toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Normalize account number for macro grouping (masked accounts → MASKED_last4).
 * @param {string} [acctNum]
 * @returns {string}
 */
export function normalizeAccountNumberForMacro(acctNum) {
  if (!acctNum || typeof acctNum !== 'string') return 'UNKNOWN';
  const cleaned = acctNum.trim().replace(/[^\dXx*•·-]/g, '');
  const last4Match = cleaned.match(/(\d{4})$/);
  if (last4Match && /[Xx*•·]/.test(cleaned)) {
    return `MASKED_${last4Match[1]}`;
  }
  return cleaned || 'UNKNOWN';
}

/**
 * Stable account id for one parsed statement within macro STAGE 3.
 * UNKNOWN + multi-PDF + default assumeSingle merges via UNKNOWN_BATCH_(bank+batchId).
 *
 * @param {{ bankName?: string, accountNumber?: string, fileHash?: string }} stmt
 * @param {{ batchId: string, parsedStatementCount: number, assumeSingleUnknownAccount?: boolean }} opts
 * @returns {string} accountId segment (not including bank prefix)
 */
export function resolveMacroAccountIdForGrouping(stmt, opts) {
  const { batchId, parsedStatementCount, assumeSingleUnknownAccount } = opts;
  const normalizedBank = normalizeBankNameForMacro(stmt.bankName);
  const normalizedAccount = normalizeAccountNumberForMacro(stmt.accountNumber);
  let accountId = normalizedAccount;
  if (normalizedAccount === 'UNKNOWN') {
    const assumeSingle =
      assumeSingleUnknownAccount !== false &&
      parsedStatementCount > 1;
    if (assumeSingle) {
      accountId = `UNKNOWN_BATCH_${crypto.createHash('md5').update(`${normalizedBank}_${batchId}`).digest('hex').slice(0, 8)}`;
    } else {
      const hashSeed = `${normalizedBank}_${stmt.fileHash || batchId}`;
      const shortHash = crypto.createHash('md5').update(hashSeed).digest('hex').slice(0, 4);
      accountId = `UNKNOWN_${shortHash}`;
    }
  }
  return accountId;
}

/**
 * Map key for `accountGroupsMap` in macro STAGE 3: `${bank}-${accountId}`.
 */
export function buildMacroAccountGroupKey(stmt, opts) {
  const normalizedBank = normalizeBankNameForMacro(stmt.bankName);
  const accountId = resolveMacroAccountIdForGrouping(stmt, opts);
  return `${normalizedBank}-${accountId}`;
}
