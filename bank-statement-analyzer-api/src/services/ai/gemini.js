/**
 * Vera chat — Gemini results co-pilot (deal JSON Q&A).
 * Model cascade: VERA_CHAT_MODEL → gemini-flash-latest → 2.0-flash → lite.
 * Results-only by default (no Google Search). Optional grounding when VERA_CHAT_GROUNDING=true.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveGeminiApiKey } from '../geminiVisionService.js';
import logger from '../../utils/logger.js';

/** Results-only underwriter — answers from deal context, not process/pipeline. */
export const VERA_SYSTEM_INSTRUCTION =
  "You are Vera, a Senior Commercial Underwriter co-pilot. " +
  "For now you ONLY discuss underwriting RESULTS from the provided deal context JSON " +
  "(decision, Veritas/bankability score, ADB, net cash flow, NSF, DSCR, deposits/withdrawals, " +
  "stipulations, Vera briefing). " +
  "Do NOT discuss extraction pipelines, checksum process steps, Gemini rescue, or telemetry. " +
  "If asked about process/pipeline, briefly say you only cover results and answer from the metrics. " +
  "Do not invent numbers — cite only values present in the deal context. " +
  "Be concise and underwriter-direct.";

const DEAL_CONTEXT_MAX = 12_000;
const HISTORY_MAX_TURNS = 20;

const DEFAULT_MODEL_CANDIDATES = [
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001'
];

export class VeraChatConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VeraChatConfigError';
    this.code = 'VERA_CHAT_NO_KEY';
  }
}

export class VeraChatUpstreamError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'VeraChatUpstreamError';
    this.code = 'VERA_CHAT_UPSTREAM';
    this.cause = cause;
  }
}

export function resolveVeraChatModel() {
  return (
    String(process.env.VERA_CHAT_MODEL || 'gemini-flash-latest').trim() ||
    'gemini-flash-latest'
  );
}

/** Ordered unique model ids to try. */
export function resolveVeraChatModelCandidates() {
  const preferred = resolveVeraChatModel();
  const envList = String(process.env.VERA_CHAT_MODEL_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = [preferred, ...envList, ...DEFAULT_MODEL_CANDIDATES];
  return [...new Set(list)];
}

/**
 * @param {unknown} history
 * @returns {{ role: 'user'|'model', parts: [{ text: string }] }[]}
 */
export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const turn of history.slice(-HISTORY_MAX_TURNS)) {
    if (!turn || typeof turn !== 'object') continue;
    const content = String(turn.content ?? turn.text ?? '').trim();
    if (!content) continue;
    const rawRole = String(turn.role || '').toLowerCase();
    const role =
      rawRole === 'assistant' || rawRole === 'model' || rawRole === 'vera'
        ? 'model'
        : 'user';
    out.push({ role, parts: [{ text: content }] });
  }
  return out;
}

/**
 * @param {unknown} dealContext
 * @returns {string}
 */
export function formatDealContextBlock(dealContext) {
  if (dealContext == null) {
    return 'Deal context: (none provided)';
  }
  let raw;
  try {
    raw = typeof dealContext === 'string' ? dealContext : JSON.stringify(dealContext);
  } catch {
    raw = String(dealContext);
  }
  if (raw.length > DEAL_CONTEXT_MAX) {
    raw = raw.slice(0, DEAL_CONTEXT_MAX) + '…[truncated]';
  }
  return `Deal context JSON:\n${raw}`;
}

/**
 * @param {object} response
 * @returns {{ used: boolean, sources: { title?: string, uri?: string }[] }}
 */
export function extractGrounding(response) {
  const candidate = response?.candidates?.[0];
  const meta = candidate?.groundingMetadata || candidate?.grounding_metadata || null;
  if (!meta) {
    return { used: false, sources: [] };
  }
  const chunks = meta.groundingChunks || meta.grounding_chunks || [];
  const sources = [];
  for (const chunk of chunks) {
    const web = chunk?.web || chunk?.retrievedContext || chunk?.retrieved_context;
    if (!web) continue;
    sources.push({
      title: web.title || web.siteName || undefined,
      uri: web.uri || web.url || undefined
    });
  }
  const supports = meta.groundingSupports || meta.grounding_supports || [];
  return {
    used: Boolean(chunks.length || supports.length || meta.searchEntryPoint),
    sources
  };
}

function isModelUnavailableError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('no longer available') ||
    msg.includes('not supported') ||
    msg.includes('is not found for api version')
  );
}

/**
 * Deterministic results co-pilot when Gemini is unavailable.
 * Answers only from dealContext — never invents pipeline details.
 * @param {string} message
 * @param {unknown} dealContext
 * @returns {string | null}
 */
export function answerFromDealContext(message, dealContext) {
  const ctx =
    dealContext && typeof dealContext === 'object' && !Array.isArray(dealContext)
      ? dealContext
      : {};
  const q = String(message || '').toLowerCase();
  const lines = [];

  const decision = ctx.veraDecision ?? ctx.decision ?? null;
  const score = ctx.veraScore ?? ctx.veritasScore ?? null;
  const badge = ctx.veritasBadge ?? ctx.bankabilityLabel ?? null;
  const metrics = ctx.metrics && typeof ctx.metrics === 'object' ? ctx.metrics : {};
  const adb = metrics.l3mAdb ?? ctx.l3mAdb ?? null;
  const nsf = metrics.nsfCount ?? ctx.nsfCount ?? null;
  const dscr = metrics.dscr ?? ctx.dscr ?? null;
  const net = ctx.netCashFlow ?? null;
  const deposits = ctx.totalDeposits ?? null;
  const withdrawals = ctx.totalWithdrawals ?? null;
  const checksumOk = ctx.checksumOk;
  const checksumFailedFiles = Array.isArray(ctx.checksumFailedFiles)
    ? ctx.checksumFailedFiles
    : [];
  const company = ctx.companyName || ctx.bankName || null;

  const wantsChecksum =
    /checksum|reconcil|balance.?match|parse.?quality|did (it|this).*(pass|fail)/i.test(q);
  const wantsDecision = /decision|stipulat|fund|decline|veritas|bankabilit|score/i.test(q);
  const wantsAdb = /\badb\b|average daily|liquidity/i.test(q);
  const wantsNsf = /\bnsf\b|overdraft|non.?sufficient/i.test(q);
  const wantsCash = /cash.?flow|net cash|deposit|withdrawal/i.test(q);
  const wantsProcess =
    /pipeline|telemetry|gemini.?vision|extraction|pdf.?plumber|how (did|was).*(pars|extract)/i.test(
      q
    );

  if (wantsProcess && !wantsChecksum && !wantsDecision && !wantsAdb && !wantsNsf && !wantsCash) {
    return (
      'I only cover underwriting **results** (decision, scores, ADB, NSF, cash flow, checksum outcome). ' +
      'Ask about those metrics for this deal.'
    );
  }

  if (wantsChecksum) {
    if (checksumOk === true) {
      lines.push('Checksum result: **PASS** — statement reconciliation matched.');
    } else if (checksumOk === false) {
      lines.push(
        'Checksum result: **FAIL** — reconciliation did not match' +
          (checksumFailedFiles.length
            ? ` (${checksumFailedFiles.join(', ')})`
            : '') +
          '.'
      );
    } else {
      lines.push('Checksum outcome is not in the current results payload.');
    }
  }

  if (wantsDecision || (!lines.length && /what.*(decision|result)|summar|overview/i.test(q))) {
    if (decision) {
      lines.push(
        `Vera decision: **${decision}**` +
          (score != null ? ` · score **${score}/10**` : '') +
          (badge ? ` (${badge})` : '') +
          '.'
      );
    }
  }

  if (wantsAdb && adb != null) {
    lines.push(`L3M ADB: **${Number(adb).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}**.`);
  }
  if (wantsNsf && nsf != null) {
    lines.push(`NSF count: **${nsf}**.`);
  }
  if (wantsCash) {
    if (net != null) {
      lines.push(
        `Net cash flow: **${Number(net).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}**.`
      );
    }
    if (deposits != null) {
      lines.push(
        `Total deposits: **${Number(deposits).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}**.`
      );
    }
    if (withdrawals != null) {
      lines.push(
        `Total withdrawals: **${Number(withdrawals).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}**.`
      );
    }
    if (dscr != null) {
      lines.push(`DSCR: **${Number(dscr).toFixed(2)}**.`);
    }
  }

  if (!lines.length) {
    const bits = [];
    if (company) bits.push(String(company));
    if (decision) bits.push(`decision ${decision}`);
    if (score != null) bits.push(`score ${score}/10`);
    if (adb != null) bits.push(`ADB available`);
    if (nsf != null) bits.push(`NSF ${nsf}`);
    if (!bits.length) {
      return (
        'I only discuss results for this statement, but no deal metrics are loaded yet. ' +
        'Open a completed underwriting report and ask again.'
      );
    }
    return (
      `Results snapshot` +
      (company ? ` for **${company}**` : '') +
      `: ${bits.join(' · ')}. ` +
      'Ask about decision, ADB, NSF, cash flow, or checksum outcome.'
    );
  }

  return lines.join(' ');
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {unknown} [opts.dealContext]
 * @param {unknown} [opts.history]
 * @returns {Promise<{ answer: string, model: string, grounding: { used: boolean, sources: object[] } }>}
 */
export async function chatWithVera({ message, dealContext, history } = {}) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new VeraChatConfigError(
      'Gemini API key not configured (GEMINI_API_KEY or GOOGLE_API_KEY)'
    );
  }

  const userMessage = String(message || '').trim();
  if (!userMessage) {
    throw new Error('message is required');
  }

  const dealBlock = formatDealContextBlock(dealContext);
  const contents = [
    ...normalizeHistory(history),
    {
      role: 'user',
      parts: [{ text: `${dealBlock}\n\nUnderwriter question:\n${userMessage}` }]
    }
  ];

  const genAI = new GoogleGenerativeAI(apiKey);
  const enableGrounding =
    String(process.env.VERA_CHAT_GROUNDING || '').toLowerCase() === 'true';

  async function run(modelId, tools) {
    const model = genAI.getGenerativeModel({
      model: modelId,
      systemInstruction: VERA_SYSTEM_INSTRUCTION,
      ...(tools ? { tools } : {})
    });
    const result = await model.generateContent({ contents });
    const response = result?.response;
    const answer = String(response?.text?.() || '').trim();
    if (!answer) {
      throw new VeraChatUpstreamError('Empty response from Gemini');
    }
    return {
      answer,
      model: modelId,
      grounding: extractGrounding(response)
    };
  }

  const candidates = resolveVeraChatModelCandidates();
  let lastErr = null;

  for (const modelId of candidates) {
    try {
      // Results-only: no search tools unless explicitly enabled.
      if (enableGrounding) {
        try {
          return await run(modelId, [{ googleSearch: {} }]);
        } catch (groundErr) {
          logger.warn('[VERA_CHAT] grounding call failed; retry without tools', {
            model: modelId,
            error: groundErr?.message
          });
          return await run(modelId, null);
        }
      }
      return await run(modelId, null);
    } catch (err) {
      lastErr = err;
      logger.warn('[VERA_CHAT] model candidate failed', {
        model: modelId,
        error: err?.message
      });
      if (!isModelUnavailableError(err) && !String(err?.message || '').includes('Empty response')) {
        // Non-404 model errors: still try next candidate once, then continue
        continue;
      }
    }
  }

  logger.error('[VERA_CHAT] all model candidates failed — using results fallback', {
    error: lastErr?.message,
    tried: candidates
  });

  const fallback = answerFromDealContext(userMessage, dealContext);
  if (fallback) {
    return {
      answer: fallback,
      model: 'results-fallback',
      grounding: { used: false, sources: [] }
    };
  }

  throw new VeraChatUpstreamError(
    lastErr?.message || 'Gemini Vera chat failed',
    lastErr
  );
}

export default {
  chatWithVera,
  VERA_SYSTEM_INSTRUCTION,
  resolveVeraChatModel,
  answerFromDealContext
};
