/**
 * Declarative per-profile reconciliation spec.
 *
 * Each profile describes the line items printed in its statement SUMMARY box and
 * whether each line is a credit (inflow) or debit (outflow). The universal
 * reconciliation engine uses this to compute the closing identity:
 *
 *   opening + Σ(credit lines) − Σ(debit lines) = closing
 *
 * This is the "any bank" mechanism: adding a new institution is data, not a new
 * formula. Labels are matched at the start of a physical SUMMARY line, so more
 * specific labels (e.g. "Returned Checks") must precede generic ones ("Checks").
 */

/**
 * @typedef {Object} SummaryLineSpec
 * @property {string} key — canonical line key (deposits, withdrawals, checks, fees, ...)
 * @property {RegExp[]} labels — line-start label patterns
 * @property {'credit'|'debit'} role — sign role in the closing identity
 * @property {boolean} [optional] — line may be absent on a given statement
 */

/**
 * @typedef {Object} ReconciliationSpec
 * @property {SummaryLineSpec[]} summaryLines
 */

/** @type {Record<string, ReconciliationSpec>} */
export const RECONCILIATION_SPECS = Object.freeze({
  regions_business_checking: {
    summaryLines: [
      { key: 'deposits', labels: [/deposits?\s*(?:&|and)\s*credits?/i], role: 'credit' },
      { key: 'automaticTransfers', labels: [/automatic\s+transfers?/i], role: 'credit', optional: true },
      { key: 'returnedChecks', labels: [/returned\s+checks?/i], role: 'credit', optional: true },
      { key: 'withdrawals', labels: [/withdrawals?(?:\s*(?:\/|and)\s*debits?)?/i], role: 'debit' },
      { key: 'fees', labels: [/fees?/i], role: 'debit', optional: true },
      { key: 'checks', labels: [/checks?/i], role: 'debit', optional: true }
    ]
  },

  chase_business_complete: {
    summaryLines: [
      {
        key: 'deposits',
        labels: [/deposits?\s+and\s+additions?/i, /deposits?\s*(?:&|and)\s*credits?/i],
        role: 'credit'
      },
      {
        key: 'withdrawals',
        labels: [
          /(?:electronic\s+)?withdrawals?/i,
          /checks?\s+paid/i,
          /other\s+withdrawals?/i
        ],
        role: 'debit'
      },
      { key: 'fees', labels: [/fees?(?:\s+and\s+charges)?/i], role: 'debit', optional: true }
    ]
  },

  wells_initiate_checking: {
    summaryLines: [
      {
        key: 'deposits',
        labels: [/deposits?\s*(?:&|and)\s*(?:other\s+)?(?:credits?|additions?)/i],
        role: 'credit'
      },
      {
        key: 'withdrawals',
        labels: [/withdrawals?\s*(?:&|and)\s*(?:other\s+)?debits?/i, /withdrawals?/i],
        role: 'debit'
      }
    ]
  },

  generic_digital: {
    summaryLines: [
      {
        key: 'deposits',
        labels: [/deposits?\s*(?:&|and)\s*(?:other\s+)?credits?/i, /deposits?\s+and\s+additions?/i, /total\s+credits?/i],
        role: 'credit'
      },
      {
        key: 'withdrawals',
        labels: [/withdrawals?(?:\s*(?:&|\/|and)\s*debits?)?/i, /total\s+debits?/i],
        role: 'debit'
      },
      { key: 'fees', labels: [/fees?(?:\s+and\s+charges)?/i], role: 'debit', optional: true }
    ]
  }
});

/**
 * @param {string} profileId
 * @returns {ReconciliationSpec}
 */
export function getReconciliationSpec(profileId) {
  return RECONCILIATION_SPECS[profileId] ?? RECONCILIATION_SPECS.generic_digital;
}

/**
 * @param {ReconciliationSpec} spec
 * @param {string} key
 * @returns {'credit'|'debit'|null}
 */
export function roleForLineKey(spec, key) {
  const line = spec?.summaryLines?.find((l) => l.key === key);
  return line?.role ?? null;
}

/**
 * Build a dynamic reconciliation spec from Gemini vision summaryLineLabels.
 * @param {Array<{ key?: string, label?: string, role?: string }>|null|undefined} summaryLineLabels
 * @returns {ReconciliationSpec|null}
 */
export function buildReconciliationSpecFromSummaryLabels(summaryLineLabels) {
  if (!Array.isArray(summaryLineLabels) || summaryLineLabels.length === 0) return null;

  const summaryLines = [];
  for (const entry of summaryLineLabels) {
    if (!entry || typeof entry !== 'object') continue;
    const key = String(entry.key || '').trim();
    const label = String(entry.label || entry.text || '').trim();
    const role = String(entry.role || '').toLowerCase();
    if (!key || !label) continue;
    if (role !== 'credit' && role !== 'debit') continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    summaryLines.push({
      key,
      labels: [new RegExp(escaped, 'i')],
      role,
      optional: Boolean(entry.optional)
    });
  }

  return summaryLines.length > 0 ? { summaryLines } : null;
}

/**
 * Resolve spec: explicit mapping spec, profile registry, or generic fallback.
 * @param {string} profileId
 * @param {object} [layoutTemplate]
 * @returns {ReconciliationSpec}
 */
export function getEffectiveReconciliationSpec(profileId, layoutTemplate) {
  const fromTemplate = layoutTemplate?.reconciliationSpec;
  if (fromTemplate?.summaryLines?.length) return fromTemplate;
  return getReconciliationSpec(profileId);
}

export default {
  RECONCILIATION_SPECS,
  getReconciliationSpec,
  getEffectiveReconciliationSpec,
  buildReconciliationSpecFromSummaryLabels,
  roleForLineKey
};
