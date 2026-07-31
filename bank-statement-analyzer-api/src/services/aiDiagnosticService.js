/**
 * Forensic checksum-mismatch diagnosis. The AI does NOT extract transactions —
 * it inspects already-parsed rows + reconciliation aggregates and names the
 * single most likely anomaly so we can auto-correct or route to HITL.
 */

import { runDiagnosticCompletion } from './aiOrchestratorService.js';
import { identifyFailingSection, extractFailingSectionContext } from './sectionDiagnostic.js';
import { detectSectionBoundaries } from './extraction/sectionBoundaryDetector.js';
import logger from '../utils/logger.js';

export const DIAGNOSIS_CODES = ['COLUMN_FLIP', 'ROW_BLEED', 'MISSING_FEE', 'MISALIGNED_COLUMNS', 'LOW_DATA_DENSITY', 'UNKNOWN'];

const MAX_SAMPLE_ROWS = 80;

const SYSTEM_PROMPT = `You are a forensic bank-statement accountant. You do NOT extract new transactions from PDFs.

You receive:
1) Structured transaction rows already extracted by a deterministic parser (pdfplumber).
2) Expected vs calculated ending balances and deposit/withdrawal aggregates.
3) Optional raw layout text sample.

Your task: identify the SINGLE most likely mathematical anomaly causing the checksum mismatch.

Diagnosis codes (pick exactly one):
- COLUMN_FLIP: Credits and debits are systematically inverted (e.g. deposit section rows signed as debits).
- ROW_BLEED: Transactions from another section/page were included (duplicate dates, wrong section totals).
- MISALIGNED_COLUMNS: Extracted deposit/withdrawal sums are massively larger than printed totals (e.g., 2x-5x), likely due to the parser confusing running balances or check numbers for amounts.
- MISSING_FEE: Likely omitted fee/interest/adjustment row explaining a small delta.
- LOW_DATA_DENSITY: The PDF lacks enough structural data (balance column empty, no section headers, sparse amounts) for deterministic extraction. Column assignment may be correct but sign inference needs help from other signals.
- UNKNOWN: Cannot determine with reasonable confidence.

Rules:
- Return ONLY valid JSON matching the schema. No markdown.
- affectedRows: 0-based indices of rows most likely wrong. Empty array if UNKNOWN.
- explanation: One or two sentences for a human underwriter.
- confidenceScore: 0.0-1.0. Use >= 0.85 only when evidence is strong (section-level sign inversion, aggregate mismatch pattern).
- Do NOT invent transactions. Do NOT rewrite amounts. Diagnose only.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string', enum: DIAGNOSIS_CODES },
    explanation: { type: 'string' },
    affectedRows: { type: 'array', items: { type: 'integer' } },
    confidenceScore: { type: 'number' }
  },
  required: ['diagnosis', 'explanation', 'affectedRows', 'confidenceScore']
};

/**
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
function compactTransactions(transactions) {
  const rows = Array.isArray(transactions) ? transactions : [];
  return rows.slice(0, MAX_SAMPLE_ROWS).map((tx, index) => ({
    index,
    date: tx?.date ?? null,
    description: String(tx?.description ?? '').slice(0, 80),
    amount: Number.isFinite(Number(tx?.amount)) ? Number(tx.amount) : null,
    type: tx?.type ?? null,
    sectionId: tx?.sectionId ?? tx?.section ?? undefined
  }));
}

/**
 * @param {object} raw
 * @param {number} sampleCount
 * @returns {{ diagnosis: string, explanation: string, affectedRows: number[], confidenceScore: number }}
 */
export function coerceDiagnosticResult(raw, sampleCount = MAX_SAMPLE_ROWS) {
  const diagnosis = DIAGNOSIS_CODES.includes(raw?.diagnosis) ? raw.diagnosis : 'UNKNOWN';
  let confidenceScore = Number(raw?.confidenceScore);
  if (!Number.isFinite(confidenceScore)) confidenceScore = 0;
  confidenceScore = Math.min(1, Math.max(0, confidenceScore));

  const affectedRows = Array.isArray(raw?.affectedRows)
    ? raw.affectedRows
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < sampleCount)
    : [];

  const explanation =
    typeof raw?.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim()
      : 'No explanation provided.';

  return {
    diagnosis: diagnosis === 'UNKNOWN' ? 'UNKNOWN' : diagnosis,
    explanation,
    affectedRows: diagnosis === 'UNKNOWN' ? [] : affectedRows,
    confidenceScore
  };
}

/**
 * Condense raw pageTelemetry into a per-section summary for the AI payload.
 * Groups pages by sectionId and sums txnRows / creditRows / debitRows.
 * If telemetry lacks credit/debit row counts, it infers them from the transactions.
 * @param {Array<object>} pageTelemetry
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
function summariseTelemetry(pageTelemetry, transactions = []) {
  if (!Array.isArray(pageTelemetry) || pageTelemetry.length === 0) {
    if (transactions.length > 0) {
      let creditRows = 0;
      let debitRows = 0;
      for (const tx of transactions) {
        if (tx.amount > 0) creditRows++;
        else if (tx.amount < 0) debitRows++;
      }
      return [{ sectionId: 'inferred', txnRows: transactions.length, creditRows, debitRows }];
    }
    return [];
  }
  
  let hasRowCounts = false;
  const bySection = {};
  for (const p of pageTelemetry) {
    const key = p.sectionId ?? 'unknown';
    if (!bySection[key]) bySection[key] = { sectionId: key, txnRows: 0, creditRows: 0, debitRows: 0 };
    bySection[key].txnRows += p.txnRows ?? 0;
    if (p.creditRows != null || p.debitRows != null) hasRowCounts = true;
    bySection[key].creditRows += p.creditRows ?? 0;
    bySection[key].debitRows += p.debitRows ?? 0;
  }
  
  if (!hasRowCounts && transactions.length > 0) {
    let creditRows = 0;
    let debitRows = 0;
    for (const tx of transactions) {
      if (tx.amount > 0) creditRows++;
      else if (tx.amount < 0) debitRows++;
    }
    // Just append the overall counts if sections couldn't provide them
    bySection['inferred'] = { sectionId: 'inferred_overall', txnRows: transactions.length, creditRows, debitRows };
  }
  
  return Object.values(bySection);
}

/**
 * @param {object} input
 * @param {Array<object>} input.transactions
 * @param {number} [input.expectedClosingBalance]
 * @param {number} [input.calculatedClosingBalance]
 * @param {number} [input.expectedOpeningBalance]
 * @param {object} [input.reconciliationBreakdown]
 * @param {Array<object>} [input.pageTelemetry]
 * @param {string} [input.layoutTextSample]
 * @param {string} [input.fileName]
 * @param {string} [input.bankName]
 * @returns {Promise<{ diagnosis: string, explanation: string, affectedRows: number[], confidenceScore: number }>}
 */
export async function analyzeMismatch(input = {}) {
  const transactions = compactTransactions(input.transactions);
  if (transactions.length === 0) {
    return coerceDiagnosticResult({ diagnosis: 'UNKNOWN', explanation: 'No transactions to analyze.' }, 0);
  }

  const sectionSummary = summariseTelemetry(input.pageTelemetry ?? [], transactions);

  const userPayload = {
    fileName: input.fileName ?? null,
    bankName: input.bankName ?? null,
    balances: {
      expectedOpeningBalance: input.expectedOpeningBalance ?? null,
      expectedClosingBalance: input.expectedClosingBalance ?? null,
      calculatedClosingBalance: input.calculatedClosingBalance ?? null
    },
    reconciliationBreakdown: input.reconciliationBreakdown ?? null,
    transactionCount: Array.isArray(input.transactions) ? input.transactions.length : 0,
    // Layout quality signals
    balanceCoverage: input.balanceCoverage ?? null,
    sectionCoverage: input.sectionCoverage ?? null,
    extractionStrategies: input.extractionStrategies ?? null,
    columnLayout: input.columnLayout ?? null,
    columnStats: input.columnStats ?? null,
    // Column flip signals
    columnFlipDetected: input.columnFlipDetected ?? null,
    depositRatio: input.depositRatio ?? null,
    withdrawalRatio: input.withdrawalRatio ?? null,
    sectionSummary: sectionSummary.length > 0 ? sectionSummary : undefined,
    transactions,
    layoutTextSample: input.layoutTextSample
      ? String(input.layoutTextSample).slice(0, 4000)
      : undefined
  };

  const user = `Diagnose the checksum mismatch. Data:\n${JSON.stringify(userPayload)}`;

  try {
    const raw = await runDiagnosticCompletion({
      system: SYSTEM_PROMPT,
      user,
      responseSchema: RESPONSE_SCHEMA,
      maxTokens: 2048
    });
    const result = coerceDiagnosticResult(raw, transactions.length);
    logger.info('[AI_DIAGNOSTIC] analyzeMismatch', {
      fileName: input.fileName,
      diagnosis: result.diagnosis,
      confidenceScore: result.confidenceScore,
      affectedRows: result.affectedRows.length
    });
    return result;
  } catch (e) {
    logger.warn('[AI_DIAGNOSTIC] analyzeMismatch failed', {
      fileName: input.fileName,
      error: e.message
    });
    return coerceDiagnosticResult(
      { diagnosis: 'UNKNOWN', explanation: `Diagnostic call failed: ${e.message}` },
      transactions.length
    );
  }
}

/**
 * Section-scoped diagnostic — analyzes only the failing section instead of full statement.
 * When a clear failing section is identified (confidence > 0.4), AI rescue is scoped
 * to just that section's text and transactions, dramatically reducing token cost.
 *
 * Falls back to full-document analyzeMismatch when no clear failing section is found.
 *
 * @param {object} params
 * @param {Array<object>} params.transactions - parsed transactions with sectionId/section
 * @param {object} params.reconciliation - reconciliation result { ok, delta, ... }
 * @param {string} params.fullText - raw extracted text from the statement
 * @param {Array<string>} [params.sectionLabels] - section label strings
 * @param {...any} params.rest - remaining inputs to pass through to analyzeMismatch
 * @returns {Promise<object>}
 */
export async function runSectionDiagnostic({ transactions, reconciliation, fullText, sectionLabels, ...analyzeMismatchInput }) {
  // 1. Identify failing section
  const { failingSection, confidence, recommendedAction } = identifyFailingSection({
    transactions,
    sectionLabels: sectionLabels || [],
    checksumRecon: reconciliation,
    fullText
  });

  if (recommendedAction !== 'section_rescue' || !failingSection) {
    // Fall back to full diagnostic
    logger.info('[AI_DIAGNOSTIC] runSectionDiagnostic falling back to full analyzeMismatch', {
      reason: recommendedAction !== 'section_rescue' ? 'low_confidence' : 'no_section',
      confidence,
      recommendedAction
    });
    return analyzeMismatch({ transactions, ...analyzeMismatchInput });
  }

  // 2. Detect boundaries and extract only the failing section's text
  const boundaries = detectSectionBoundaries(fullText);
  const sectionText = extractFailingSectionContext(fullText, failingSection, boundaries);

  // 3. Filter transactions to only the failing section
  const scopedTransactions = transactions.filter(t =>
    (t.sectionId === failingSection || t.section === failingSection)
  );

  logger.info('[AI_DIAGNOSTIC] runSectionDiagnostic scoping to section', {
    failingSection,
    confidence,
    scopedTxCount: scopedTransactions.length,
    totalTxCount: transactions.length,
    sectionTextLength: sectionText.length,
    fullTextLength: fullText.length
  });

  // 4. Run AI diagnostic on JUST the failing section
  // This is significantly cheaper — 500-2000 chars instead of 8000+ chars
  const result = await analyzeMismatch({
    transactions: scopedTransactions,
    ...analyzeMismatchInput,
    layoutTextSample: sectionText
  });

  return {
    ...result,
    sectionScoped: true,
    failingSection,
    tokenSavings: `Section-scoped: ~${sectionText.length} chars vs full text: ~${fullText.length} chars`
  };
}

export default { analyzeMismatch, coerceDiagnosticResult, DIAGNOSIS_CODES, runSectionDiagnostic };
