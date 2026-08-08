/**
 * Gemini Vision Provider — Helios AI.Vision provider implementation.
 *
 * Extracted from geminiVisionService.js. Handles Gemini-specific logic:
 * prompt construction, API calls, and response parsing/coercion.
 * Caching and rate limiting are orchestrator concerns and are excluded.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';
import { logStructured } from '../../utils/structuredLog.js';

// ---------------------------------------------------------------------------
// Module-level constants (shared prompts / schemas)
// ---------------------------------------------------------------------------

const MATH_PATTERNS = ['MINUS_PREFIX', 'PARENTHESES', 'DEBIT_CREDIT_SEPARATE'];

export const VISION_SYSTEM_INSTRUCTION = `You are a Senior Financial Data Engineer. Analyze the provided bank statement PDF visually and textually. Your goal is to create a deterministic mapping for a regex-based parser that extracts EVERY posted transaction on the statement.

Analysis Requirements:

Header Anchors: Identify exact printed strings marking the start and end of transaction regions. For Wells Fargo / Initiate Business Checking, the activity block is usually under "Transaction history" and ends before "Daily balance summary" or "Interest summary" — do NOT anchor only to a one-line summary on page 2.

Account Boundaries (REQUIRED for multi-account PDFs): Strictly segment by account. If the PDF contains more than one account (e.g. Business Checking + Savings, or multiple checking numbers), list each in accountSegments[] with its own start/end anchors and do NOT let one account's rows bleed into another's. Prefer the primary operating account for headerAnchors/vitals when multiple exist; still enumerate every account segment.

Multi-Table (REQUIRED for commercial statements): Commercial PDFs contain MULTIPLE transaction tables across many pages. You MUST list ALL of them in transactionSections[], each with its own start/end anchor pair. Examples:
- Regions: Electronic Deposits, Electronic Withdrawals, Checks Cleared, Bank Fees, Service Charges
- Wells Fargo: sections under Transaction history (deposits/credits block, withdrawals/debits block, fees, checks paid, card activity, etc.)
Never return only the first sub-table or a 2–5 row sample — if the statement spans 10+ pages of activity, your transactionSections must cover the full activity span (use the broadest start anchor such as "Transaction history" and section-specific headers for each sub-table).

Secondary mini-ledgers (REQUIRED when present): Service Fees / Service Charges, Interest / Interest summary detail rows, and Returned Items / NSF / Overdraft fee tables are ACTIVITY to extract — not merely stop-anchors for the main history block. Include each mini-ledger as its own transactionSections[] entry so rows can be appended to the primary activity set. Do not skip fee/interest/returned-item ledgers just because they sit after "Transaction history".

Column Mapping: Determine the horizontal order (0-indexed) of Date, Description, Amount, and Balance. For DEBIT_CREDIT_SEPARATE layouts, include debitIdx and creditIdx column indices.

Math Patterns: Identify if the bank uses:
- MINUS_PREFIX (e.g., -100.00)
- PARENTHESES (e.g., (100.00))
- DEBIT_CREDIT_SEPARATE (distinct columns for debits and credits — both indices required).

Spatial Logic: Note if the 'Balance' column is visually distinct; use null for balanceIdx if there is no separate balance column.

Parsing bleed guardrails: Never treat routing numbers (9 digits), account numbers, or tax IDs as transaction amounts. Amounts must have two decimal places. Ignore "Statement period activity summary" totals (Deposits/Credits 29,173.53) — those are aggregates, not row-level transactions.

Vitals: Read printed Beginning/Opening and Ending/Closing balances from the summary (not sums of your sample rows).`;

export const VISION_USER_SCHEMA = `Return ONLY a raw JSON object (no markdown, no backticks) with exactly this structure:
{
  "layoutName": "String (e.g., WellsFargo_InitiateChecking_v1)",
  "headerAnchors": { "start": "Transaction history", "end": "Daily balance summary" },
  "columnMapping": { "dateIdx": 0, "descIdx": 1, "amountIdx": 2, "balanceIdx": null, "debitIdx": 3, "creditIdx": 4 },
  "mathPattern": "MINUS_PREFIX",
  "confidenceScore": 0.85,
  "vitals": { "currency": "USD", "dateFormat": "MM/DD/YYYY", "openingBalance": 1234.56, "closingBalance": 5678.90 },
  "accountSegments": [
    { "label": "Business Checking …1234", "accountNumberLast4": "1234", "start": "Account number: 1234", "end": "Account number: 5678" }
  ],
  "transactionSections": [
    { "label": "Transaction history (all activity)", "start": "Transaction history", "end": "Daily balance summary" },
    { "label": "Electronic Deposits", "start": "ELECTRONIC DEPOSITS", "end": "Total deposits" },
    { "label": "Electronic Withdrawals", "start": "ELECTRONIC WITHDRAWALS", "end": "Total withdrawals" },
    { "label": "Checks Paid", "start": "CHECKS PAID", "end": "Total checks" },
    { "label": "Service Fees", "start": "Service fee summary", "end": "Total service fees" },
    { "label": "Interest", "start": "Interest summary", "end": "Total interest paid" },
    { "label": "Returned Items / NSF", "start": "Returned item", "end": "Total returned items" }
  ]
}

Rules:
- accountSegments is OPTIONAL. When the PDF has multiple accounts, list each account with exact start/end anchors so extraction does not bleed across accounts.
- transactionSections is REQUIRED when the PDF has more than one transaction block or multiple pages of activity. Include every distinct table (deposits, withdrawals, checks, fees, interest, returned items/NSF, card, ACH, etc.). Mini-ledgers are activity sections, not stop-anchors only.
- headerAnchors.start/end should span the full primary-account activity region; per-table sections use narrower start/end pairs.
- Each start/end string must be copied exactly from the PDF (case and spacing matter).
- mathPattern must be exactly one of: MINUS_PREFIX, PARENTHESES, DEBIT_CREDIT_SEPARATE.
- For DEBIT_CREDIT_SEPARATE, debitIdx and creditIdx are required in columnMapping.
- columnMapping indices are 0-based from splitting each transaction row on 2+ spaces or tabs.
- confidenceScore must be a number from 0.0 to 1.0.
- vitals.openingBalance and vitals.closingBalance are numbers from the printed statement summary (not calculated from transactions).`;

const LAYOUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    layoutName: { type: 'string' },
    headerAnchors: {
      type: 'object',
      properties: { start: { type: 'string' }, end: { type: 'string' } },
      required: ['start', 'end']
    },
    columnMapping: {
      type: 'object',
      properties: {
        dateIdx: { type: 'integer' },
        descIdx: { type: 'integer' },
        amountIdx: { type: 'integer' },
        balanceIdx: { type: 'integer', nullable: true },
        debitIdx: { type: 'integer', nullable: true },
        creditIdx: { type: 'integer', nullable: true }
      },
      required: ['dateIdx', 'descIdx', 'amountIdx']
    },
    mathPattern: { type: 'string' },
    confidenceScore: { type: 'number' },
    vitals: {
      type: 'object',
      properties: {
        currency: { type: 'string' },
        dateFormat: { type: 'string' },
        openingBalance: { type: 'number', nullable: true },
        closingBalance: { type: 'number', nullable: true }
      }
    },
    accountSegments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          accountNumberLast4: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' }
        },
        required: ['start']
      }
    },
    transactionSections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' }
        },
        required: ['start']
      }
    }
  },
  required: ['headerAnchors', 'columnMapping', 'mathPattern', 'confidenceScore']
};

// ---------------------------------------------------------------------------
// Helper functions (copied from geminiVisionService.js to keep provider self-contained)
// ---------------------------------------------------------------------------

/**
 * @param {object} cm
 * @returns {{ debitCol: number|null, creditCol: number|null }}
 */
function mapDebitCreditColumns(cm) {
  const src = cm && typeof cm === 'object' ? cm : {};
  const debitRaw = src.debitCol ?? src.debitIdx ?? src.debitColumn;
  const creditRaw = src.creditCol ?? src.creditIdx ?? src.creditColumn;
  const debitCol = Number.isFinite(Number(debitRaw)) ? Number(debitRaw) : null;
  const creditCol = Number.isFinite(Number(creditRaw)) ? Number(creditRaw) : null;
  return { debitCol, creditCol };
}

/**
 * @param {object} columnMapping
 * @param {string} mathPattern
 * @returns {string}
 */
function resolveMathPatternWithDebitCredit(columnMapping, mathPattern) {
  let pattern = String(mathPattern || 'MINUS_PREFIX').toUpperCase().replace(/\s+/g, '_');
  if (pattern === 'DEBIT|CREDIT|SEPARATE' || pattern === 'DEBIT-CREDIT-SEPARATE') {
    pattern = 'DEBIT_CREDIT_SEPARATE';
  }
  if (pattern === 'DEBIT_CREDIT_SEPARATE') {
    const { debitCol, creditCol } = mapDebitCreditColumns(columnMapping);
    if (debitCol == null || creditCol == null) {
      return 'MINUS_PREFIX';
    }
  }
  return pattern;
}

function layoutConfidenceMin() {
  const n = Number(process.env.GEMINI_VISION_CONFIDENCE_MIN);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.55;
}

function layoutMaxPages() {
  const n = Number(process.env.GEMINI_VISION_LAYOUT_MAX_PAGES);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 30) : 8;
}

/** @returns {string} API key from GEMINI_API_KEY or GOOGLE_API_KEY */
function resolveGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

/** @returns {string} Generative model id for layout vision */
function resolveGeminiVisionModel() {
  return String(process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest').trim() || 'gemini-flash-latest';
}

/** @param {string} [raw] */
function stripMarkdownFences(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m) return m[1].trim();
  return s;
}

/**
 * @param {string|object|null|undefined} raw
 * @returns {object|null}
 */
function extractJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const cleaned = stripMarkdownFences(raw);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Map Gemini vision JSON (start/end, *Idx) into the shape expected by coerceLayoutMapping.
 * @param {object} parsed
 * @returns {object|null}
 */
function prenormalizeVisionPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const ha = parsed.headerAnchors && typeof parsed.headerAnchors === 'object' ? parsed.headerAnchors : {};
  const useNewAnchors = 'start' in ha || 'end' in ha;
  const headerAnchors = {
    tableStart: String(useNewAnchors ? (ha.start ?? '') : (ha.tableStart ?? '')),
    tableEnd: String(useNewAnchors ? (ha.end ?? '') : (ha.tableEnd ?? ''))
  };

  const cm = parsed.columnMapping && typeof parsed.columnMapping === 'object' ? parsed.columnMapping : {};
  const useNewCols =
    'dateIdx' in cm ||
    'descIdx' in cm ||
    'amountIdx' in cm ||
    'balanceIdx' in cm ||
    'debitIdx' in cm ||
    'creditIdx' in cm;
  const { debitCol, creditCol } = mapDebitCreditColumns(cm);
  let columnMapping;
  if (useNewCols) {
    const bal = cm.balanceIdx;
    columnMapping = {
      dateCol: Number.isFinite(Number(cm.dateIdx)) ? Number(cm.dateIdx) : 0,
      descCol: Number.isFinite(Number(cm.descIdx)) ? Number(cm.descIdx) : 1,
      amountCol: Number.isFinite(Number(cm.amountIdx)) ? Number(cm.amountIdx) : 2,
      balanceCol:
        bal === null || bal === undefined || bal === '' || bal === 'null'
          ? null
          : Number.isFinite(Number(bal))
            ? Number(bal)
            : null,
      debitCol,
      creditCol
    };
  } else {
    columnMapping = {
      dateCol: Number.isFinite(Number(cm.dateCol)) ? Number(cm.dateCol) : 0,
      descCol: Number.isFinite(Number(cm.descCol)) ? Number(cm.descCol) : 1,
      amountCol: Number.isFinite(Number(cm.amountCol)) ? Number(cm.amountCol) : 2,
      balanceCol:
        cm.balanceCol === null || cm.balanceCol === undefined || cm.balanceCol === ''
          ? null
          : Number.isFinite(Number(cm.balanceCol))
            ? Number(cm.balanceCol)
            : null,
      debitCol,
      creditCol
    };
  }

  const conf = parsed.confidenceScore ?? parsed.confidence;
  const balanceReconciliationHint = String(parsed.balanceReconciliationHint ?? '');

  let transactionSections = null;
  if (Array.isArray(parsed.transactionSections) && parsed.transactionSections.length > 0) {
    transactionSections = parsed.transactionSections
      .map((sec) => {
        if (!sec || typeof sec !== 'object') return null;
        const tableStart = String(sec.start ?? sec.tableStart ?? '').trim();
        if (!tableStart) return null;
        return {
          label: String(sec.label ?? '').trim(),
          tableStart,
          tableEnd: String(sec.end ?? sec.tableEnd ?? '').trim()
        };
      })
      .filter(Boolean);
    if (transactionSections.length === 0) transactionSections = null;
  }

  return {
    headerAnchors,
    columnMapping,
    mathPattern: parsed.mathPattern,
    balanceReconciliationHint,
    confidence: conf,
    transactionSections,
    _layoutName: parsed.layoutName,
    _vitals: parsed.vitals
  };
}

/**
 * Coerce raw layout JSON into the canonical shape used by deterministic runners.
 * @param {object|null} parsed
 * @returns {object|null}
 */
function coerceLayoutMapping(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const headerAnchors = parsed.headerAnchors && typeof parsed.headerAnchors === 'object'
    ? {
        tableStart: String(parsed.headerAnchors.tableStart ?? ''),
        tableEnd: String(parsed.headerAnchors.tableEnd ?? '')
      }
    : { tableStart: '', tableEnd: '' };

  const cm = parsed.columnMapping && typeof parsed.columnMapping === 'object' ? parsed.columnMapping : {};
  const { debitCol, creditCol } = mapDebitCreditColumns(cm);
  const columnMapping = {
    dateCol: Number.isFinite(Number(cm.dateCol)) ? Number(cm.dateCol) : 0,
    descCol: Number.isFinite(Number(cm.descCol)) ? Number(cm.descCol) : 1,
    amountCol: Number.isFinite(Number(cm.amountCol)) ? Number(cm.amountCol) : 2,
    balanceCol:
      cm.balanceCol === null || cm.balanceCol === undefined || cm.balanceCol === ''
        ? null
        : Number.isFinite(Number(cm.balanceCol))
          ? Number(cm.balanceCol)
          : null,
    debitCol,
    creditCol
  };

  let mathPattern = resolveMathPatternWithDebitCredit(columnMapping, parsed.mathPattern);
  if (!MATH_PATTERNS.includes(mathPattern)) {
    mathPattern = 'MINUS_PREFIX';
  }

  const balanceReconciliationHint = String(parsed.balanceReconciliationHint ?? '');

  let layoutConfidence;
  const c = parsed.confidence;
  if (c != null && Number.isFinite(Number(c))) {
    layoutConfidence = Math.min(1, Math.max(0, Number(c)));
  }

  const transactionSections = Array.isArray(parsed.transactionSections)
    ? parsed.transactionSections
        .map((sec) => {
          if (!sec || typeof sec !== 'object') return null;
          const tableStart = String(sec.tableStart ?? sec.start ?? '').trim();
          if (!tableStart) return null;
          return {
            label: String(sec.label ?? '').trim(),
            tableStart,
            tableEnd: String(sec.tableEnd ?? sec.end ?? '').trim()
          };
        })
        .filter(Boolean)
    : null;

  return {
    headerAnchors,
    columnMapping,
    mathPattern,
    balanceReconciliationHint,
    ...(transactionSections?.length ? { transactionSections } : {}),
    ...(layoutConfidence !== undefined ? { layoutConfidence } : {})
  };
}

/**
 * Reject layouts where sample rows fail basic date/amount parse (hallucination guard).
 * @param {object} layout coerced layout
 * @param {Array<{ date?: string, amount?: number, description?: string }>} [sampleRows]
 */
export function validateLayoutAgainstSampleRows(layout, sampleRows = []) {
  if (!layout || !Array.isArray(sampleRows) || sampleRows.length === 0) return true;
  let ok = 0;
  for (const row of sampleRows.slice(0, 8)) {
    const amt = Number(row?.amount);
    const d = row?.date ? new Date(row.date) : null;
    if (Number.isFinite(amt) && d && !Number.isNaN(d.getTime())) ok += 1;
  }
  return ok >= Math.max(1, Math.floor(sampleRows.length * 0.5));
}

// ---------------------------------------------------------------------------
// PDF utilities
// ---------------------------------------------------------------------------

/**
 * Extract first N pages from a PDF buffer.
 * @param {Buffer} pdfBuffer
 * @param {number} maxPages
 * @returns {Promise<Buffer>}
 */
export async function extractFirstPagesPdfBuffer(pdfBuffer, maxPages = 20) {
  const src = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const n = Math.min(src.getPageCount(), Math.max(1, maxPages));
  const idx = Array.from({ length: n }, (_, i) => i);
  const pages = await out.copyPages(src, idx);
  pages.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}

// ---------------------------------------------------------------------------
// Gemini API interaction
// ---------------------------------------------------------------------------

/**
 * @param {*} model GenerativeModel from @google/generative-ai
 * @param {Array<{ text?: string, inlineData?: { mimeType: string, data: string } }>} parts
 */
async function generateVisionContent(model, parts) {
  const result = await model.generateContent(parts);
  const response = result.response;
  return typeof response.text === 'function' ? response.text() : '';
}

// ---------------------------------------------------------------------------
// Main analyze function (no caching, no rate limiting — orchestrator concerns)
// ---------------------------------------------------------------------------

/**
 * Multimodal layout analysis for Helios deterministic runner templates.
 * @param {Buffer} pdfBuffer
 * @param {{ rtn?: string, statementId?: string, jobId?: string, bankName?: string, digitalTextExcerpt?: string, sampleRows?: Array, printedOpeningBalance?: number, printedClosingBalance?: number }} [options]
 * @returns {Promise<object>}
 */
export async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not set');
  }

  const rtn = String(options.rtn || '').replace(/\D/g, '');
  const logBase = {
    domain: 'gemini-vision',
    rtn: rtn || null,
    bankName: options.bankName || null,
    statementId: options.statementId || null,
    jobId: options.jobId || null
  };

  logStructured('info', '[VISION_START] Analyzing new layout for RTN', logBase);

  const subset = await extractFirstPagesPdfBuffer(pdfBuffer, layoutMaxPages());
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: resolveGeminiVisionModel(),
    systemInstruction: VISION_SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: LAYOUT_JSON_SCHEMA
    }
  });

  const routingLine = rtn ? `Routing context (ABA): ${rtn}` : 'Routing context: unknown';
  const excerpt = String(options.digitalTextExcerpt || '').trim();
  const excerptBlock = excerpt
    ? `\n\nDigital PDF text excerpt (anchor strings MUST appear verbatim in this text):\n---\n${excerpt}\n---`
    : '';
  const primaryParts = [
    { text: `${VISION_USER_SCHEMA}\n\n${routingLine}${excerptBlock}` },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: subset.toString('base64')
      }
    }
  ];

  let text = '';
  try {
    text = await generateVisionContent(model, primaryParts);
  } catch (e) {
    logStructured('warn', '[VISION_FAILURE] Gemini generateContent failed', {
      ...logBase,
      error: e.message,
      responseLength: 0
    });
    throw e;
  }

  let parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = String(text).slice(0, 4000);
    const repairParts = [
      {
        text: `Your previous output was not valid JSON or could not be parsed. Output (truncated):\n${snippet}\n\nReturn ONLY a single raw JSON object matching the schema described earlier (layoutName, headerAnchors.start/end, columnMapping with dateIdx, descIdx, amountIdx, balanceIdx, mathPattern, confidenceScore, vitals). No markdown.`
      },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: subset.toString('base64')
        }
      }
    ];
    try {
      text = await generateVisionContent(model, repairParts);
      parsed = extractJsonObject(text);
    } catch (e) {
      logStructured('warn', '[VISION_FAILURE] JSON repair retry failed', {
        ...logBase,
        error: e.message,
        responseLength: String(text).length
      });
      throw new Error(`Gemini returned no parseable layout JSON: ${e.message}`);
    }
  }

  if (!parsed) {
    logStructured('warn', '[VISION_FAILURE] Unparseable layout JSON after repair', {
      ...logBase,
      responseLength: String(text).length
    });
    throw new Error('Gemini returned no parseable layout JSON');
  }

  const pre = prenormalizeVisionPayload(parsed);
  if (!pre) {
    logStructured('warn', '[VISION_FAILURE] Vision payload pre-normalize failed', logBase);
    throw new Error('Gemini layout JSON could not be normalized');
  }

  const { _layoutName, _vitals, ...forCoerce } = pre;
  const core = coerceLayoutMapping(forCoerce);
  if (!core) {
    logStructured('warn', '[VISION_FAILURE] coerceLayoutMapping returned null', logBase);
    throw new Error('Gemini layout JSON coercion failed');
  }

  const conf = core.layoutConfidence ?? parsed.confidenceScore ?? parsed.confidence;
  const minConf = layoutConfidenceMin();
  if (conf != null && Number(conf) < minConf) {
    logStructured('warn', '[VISION_FAILURE] Layout confidence below floor', {
      ...logBase,
      confidenceScore: conf,
      minConfidence: minConf
    });
    const err = new Error(`LAYOUT_LOW_CONFIDENCE: score ${conf} < ${minConf}`);
    err.code = 'LAYOUT_LOW_CONFIDENCE';
    throw err;
  }

  const finalOut = {
    ...core,
    ...(_layoutName != null && String(_layoutName).trim()
      ? { layoutName: String(_layoutName).trim() }
      : {}),
    ...(_vitals && typeof _vitals === 'object' ? { vitals: _vitals } : {})
  };

  if (options.sampleRows && !validateLayoutAgainstSampleRows(finalOut, options.sampleRows)) {
    logStructured('warn', '[VISION_FAILURE] Layout failed sample-row validation', logBase);
    const err = new Error('LAYOUT_SAMPLE_VALIDATION_FAILED');
    err.code = 'LAYOUT_SAMPLE_VALIDATION_FAILED';
    throw err;
  }

  logStructured('info', '[VISION_SUCCESS] Layout learned', {
    ...logBase,
    confidenceScore: finalOut.layoutConfidence ?? null,
    layoutName: finalOut.layoutName || null
  });

  return finalOut;
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const geminiVisionProvider = {
  name: 'gemini',

  analyzeStatementLayout,

  extractFirstPagesPdfBuffer,

  supportsSectionalAnalysis: false,

  maxContextPages: layoutMaxPages()
};

export default geminiVisionProvider;

// Re-export helpers for convenience (used by aiVisionService.js router)
export { MATH_PATTERNS, coerceLayoutMapping, extractJsonObject };