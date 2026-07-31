/**
 * Claude Vision Provider — Helios AI.Vision provider implementation.
 *
 * Uses Anthropic's Claude API via @anthropic-ai/sdk for multimodal layout
 * analysis of bank statement PDFs. Shares prompts/schema with the Gemini
 * provider for consistent output format.
 *
 * @license Copyright (c) 2025 Shift 4 Financial INC
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  extractFirstPagesPdfBuffer,
  coerceLayoutMapping,
  extractJsonObject,
  VISION_SYSTEM_INSTRUCTION,
  VISION_USER_SCHEMA
} from './geminiVisionProvider.js';
import { logStructured } from '../../utils/structuredLog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModel() {
  return String(process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-4-20250514').trim();
}

function layoutConfidenceMin() {
  const n = Number(process.env.GEMINI_VISION_CONFIDENCE_MIN);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.55;
}

/** Map Claude response fields (start/end, *Idx) → canonical shape expected by coerceLayoutMapping. */
function adaptClaudeLayout(parsed) {
  const ha = (parsed.headerAnchors && typeof parsed.headerAnchors === 'object')
    ? parsed.headerAnchors : {};
  const cm = (parsed.columnMapping && typeof parsed.columnMapping === 'object')
    ? parsed.columnMapping : {};

  const bal = cm.balanceIdx;
  const columnMapping = {
    dateCol: Number.isFinite(Number(cm.dateIdx)) ? Number(cm.dateIdx) : 0,
    descCol: Number.isFinite(Number(cm.descIdx)) ? Number(cm.descIdx) : 1,
    amountCol: Number.isFinite(Number(cm.amountIdx)) ? Number(cm.amountIdx) : 2,
    balanceCol: (bal === null || bal === undefined || bal === '' || bal === 'null')
      ? null : Number.isFinite(Number(bal)) ? Number(bal) : null,
    debitCol: Number.isFinite(Number(cm.debitIdx)) ? Number(cm.debitIdx) : null,
    creditCol: Number.isFinite(Number(cm.creditIdx)) ? Number(cm.creditIdx) : null
  };

  let txns = null;
  if (Array.isArray(parsed.transactionSections) && parsed.transactionSections.length > 0) {
    txns = parsed.transactionSections
      .map((sec) => {
        if (!sec || typeof sec !== 'object') return null;
        const ts = String(sec.start ?? '').trim();
        return ts ? { label: String(sec.label ?? '').trim(), tableStart: ts, tableEnd: String(sec.end ?? '').trim() } : null;
      })
      .filter(Boolean);
    if (txns.length === 0) txns = null;
  }

  return {
    headerAnchors: { tableStart: String(ha.start ?? ''), tableEnd: String(ha.end ?? '') },
    columnMapping,
    mathPattern: parsed.mathPattern,
    confidence: parsed.confidenceScore ?? parsed.confidence,
    balanceReconciliationHint: '',
    transactionSections: txns,
    _layoutName: parsed.layoutName,
    _vitals: parsed.vitals
  };
}

/** Send a Claude message with PDF document, return concatenated text response. */
async function sendClaudeMessage(anthropic, model, system, userText, pdfBase64) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }
      ]
    }]
  });
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Core analysis function
// ---------------------------------------------------------------------------

async function analyzeStatementLayout(pdfBuffer, options = {}) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Claude vision provider: ANTHROPIC_API_KEY is not set. Set it or use AI_VISION_PROVIDER=gemini.');
  }

  const rtn = String(options.rtn || '').replace(/\D/g, '');
  const logBase = { domain: 'claude-vision', rtn: rtn || null, bankName: options.bankName || null, statementId: options.statementId || null, jobId: options.jobId || null };
  logStructured('info', '[VISION_START] Claude analyzing layout for RTN', logBase);

  const subset = await extractFirstPagesPdfBuffer(pdfBuffer, 5);
  const pdfBase64 = subset.toString('base64');

  const routingLine = rtn ? `Routing context (ABA): ${rtn}` : 'Routing context: unknown';
  const excerpt = String(options.digitalTextExcerpt || '').trim();
  const excerptBlock = excerpt ? `\n\nDigital PDF text excerpt:\n---\n${excerpt}\n---` : '';
  const userText = `${VISION_USER_SCHEMA}\n\n${routingLine}${excerptBlock}`;

  const model = resolveModel();
  const anthropic = new Anthropic({ apiKey });

  // Primary call
  let text;
  try {
    text = await sendClaudeMessage(anthropic, model, VISION_SYSTEM_INSTRUCTION, userText, pdfBase64);
  } catch (e) {
    logStructured('warn', '[VISION_FAILURE] Claude API call failed', { ...logBase, error: e.message });
    throw new Error(`Claude vision API error: ${e.message}`);
  }

  // Parse JSON
  let parsed = extractJsonObject(text);
  if (!parsed) {
    logStructured('warn', '[VISION_RETRY] Invalid JSON, retrying', logBase);
    const snippet = String(text).slice(0, 4000);
    const repairPrompt = `Your previous output was not valid JSON. Output (truncated):\n${snippet}\n\nReturn ONLY a raw JSON object: layoutName, headerAnchors.start/end, columnMapping with dateIdx/descIdx/amountIdx/balanceIdx, mathPattern, confidenceScore, vitals, transactionSections. No markdown.`;
    try {
      text = await sendClaudeMessage(anthropic, model, VISION_SYSTEM_INSTRUCTION, repairPrompt, pdfBase64);
      parsed = extractJsonObject(text);
    } catch (e) {
      logStructured('warn', '[VISION_FAILURE] JSON repair retry failed', { ...logBase, error: e.message });
      throw new Error(`Claude returned no parseable layout JSON: ${e.message}`);
    }
  }

  if (!parsed) {
    logStructured('warn', '[VISION_FAILURE] Unparseable JSON after repair', logBase);
    throw new Error('Claude returned no parseable layout JSON');
  }

  // Coerce to canonical layout
  const adapted = adaptClaudeLayout(parsed);
  const { _layoutName, _vitals, ...forCoerce } = adapted;
  const core = coerceLayoutMapping(forCoerce);
  if (!core) {
    logStructured('warn', '[VISION_FAILURE] Layout coercion failed', logBase);
    throw new Error('Claude layout JSON coercion failed');
  }

  // Confidence check
  const conf = core.layoutConfidence ?? parsed.confidenceScore ?? parsed.confidence;
  const minConf = layoutConfidenceMin();
  if (conf != null && Number(conf) < minConf) {
    const err = new Error(`LAYOUT_LOW_CONFIDENCE: score ${conf} < ${minConf}`);
    err.code = 'LAYOUT_LOW_CONFIDENCE';
    logStructured('warn', '[VISION_FAILURE] Layout confidence below floor', { ...logBase, confidenceScore: conf, minConfidence: minConf });
    throw err;
  }

  const result = {
    ...core,
    ...(_layoutName != null && String(_layoutName).trim() ? { layoutName: String(_layoutName).trim() } : {}),
    ...(_vitals && typeof _vitals === 'object' ? { vitals: _vitals } : {})
  };

  logStructured('info', '[VISION_SUCCESS] Claude layout learned', { ...logBase, confidenceScore: result.layoutConfidence ?? null, layoutName: result.layoutName || null });
  return result;
}

// ---------------------------------------------------------------------------
// Provider object
// ---------------------------------------------------------------------------

export const claudeVisionProvider = {
  name: 'claude',
  analyzeStatementLayout,
  extractFirstPagesPdfBuffer,
  supportsSectionalAnalysis: true,
  maxContextPages: 5
};

export default claudeVisionProvider;
