import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { loadContractMocks } from '../contracts/loadContractMocks.js';
import logger from '../utils/logger.js';
import { resolveGeminiApiKey } from './geminiVisionService.js';
import { extractJsonObject } from './geminiVisionService.js';

const DECISIONS = ['FUND', 'DECLINE', 'STIPULATE'];
const VERA_MODEL = String(process.env.VERA_BRIEFING_MODEL || 'gemini-flash-latest').trim() || 'gemini-flash-latest';

const VERA_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    decision: {
      type: SchemaType.STRING,
      enum: DECISIONS,
      description: 'Final underwriting verdict: FUND, DECLINE, or STIPULATE'
    },
    bankabilityScore: {
      type: SchemaType.NUMBER,
      description: 'Bankability score from 1.0 to 10.0 (one decimal allowed)'
    },
    stipulations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING }
        },
        required: ['title']
      }
    },
    briefingMarkdown: {
      type: SchemaType.STRING,
      description:
        'Executive underwriting briefing in Markdown with sections: Deal Context, Forensic Findings, Single Biggest Strength, Single Biggest Risk, Underwriter Recommendation, and What Would Change My Mind (required for STIPULATE)'
    }
  },
  required: ['decision', 'bankabilityScore', 'stipulations', 'briefingMarkdown']
};

const SENIOR_UW_SYSTEM = `You are Vera, a Senior Commercial Underwriter at Shift 4 Funding (working capital and equipment finance for brokers).

Your job is to produce a decisive, data-driven underwriting package for commercial loan brokers who need fast, accurate decisions.

Rules:
- Use ONLY the JSON deal package provided. Do not invent bank balances or revenue not supported by the data.
- decision must be exactly one of: FUND, DECLINE, STIPULATE.
- bankabilityScore is 1.0–10.0 (broker-facing; 10 is strongest).
- DECLINE when CRITICAL alerts exist, obvious fraud/synthetic deposit patterns, or junior underwriter decision is DECLINE.
- STIPULATE when fundable with document gaps, NSF clusters, or material forensic flags.
- FUND only when cash flow, character, and capacity support the requested amount with manageable risk.
- briefingMarkdown must be valid Markdown, professional tone, cite specific numbers from the package.
- Include "## Single Biggest Strength" and "## Single Biggest Risk" as one-liners each.
- For STIPULATE, include "## What Would Change My Mind" with numbered items matching stipulations.
- stipulations: actionable broker tasks (empty array if FUND with no conditions).`;

export function useVeraBriefingV2() {
  return String(process.env.USE_VERA_BRIEFING_V2 || '').toLowerCase() === 'true';
}

export function mapPerplexityFundingToVeraDecision(fundingDecision) {
  const d = String(fundingDecision || '').toUpperCase();
  if (d.includes('NOT') || d === 'DECLINE') return 'DECLINE';
  if (d === 'FUNDABLE' || d === 'FUND') return 'FUND';
  return 'STIPULATE';
}

function countBySeverity(alerts, severity) {
  const items = Array.isArray(alerts) ? alerts : alerts?.items || [];
  return items.filter((a) => String(a.severity || '').toUpperCase() === severity).length;
}

function compactDealPackage(ctx) {
  const { macroResult = {}, applicationData = {}, alerts = [], juniorUnderwriter = null } = ctx;
  const app = applicationData || macroResult.applicationData || {};
  const alertItems = (Array.isArray(alerts) ? alerts : alerts?.items || macroResult?.alerts || []).slice(
    0,
    30
  );

  return {
    applicationData: app,
    deal: {
      companyName: app.companyName || app.dbaName,
      requestedLoanAmount: app.requestedLoanAmount,
      statedRevenue: app.statedRevenue || app.statedGAR || app.annualRevenue,
      taxId: app.taxId,
      industry: app.industry
    },
    metrics: macroResult.metrics || macroResult.financialTotals || {},
    accountingSummary: macroResult.accountingSummary || null,
    juniorUnderwriter: juniorUnderwriter || macroResult.juniorUnderwriter || null,
    forensicIntelligence: macroResult.forensicIntelligence || null,
    underwritingVitals: macroResult.underwritingVitals || null,
    overallRisk: macroResult.overallRisk || null,
    summary: macroResult.summary || null,
    alerts: alertItems,
    accountGroups: (macroResult.accountGroups || []).slice(0, 10).map((g) => ({
      bankName: g.bankName,
      accountNumber: g.accountNumber,
      veritasScore: g.veritasScore,
      transactionCount: g.transactionCount
    }))
  };
}

function buildDeclineBriefing(companyName, reasons) {
  return (
    `# Executive Underwriting Briefing\n\n` +
    `**Decision:** DECLINE   **Bankability:** 2.0/10\n\n` +
    `## Deal Context\n\n- **Applicant:** ${companyName}\n\n` +
    `## Single Biggest Risk\n\n${reasons.join(' ')}\n\n` +
    `## Underwriter Recommendation\n\n**DECLINE** — critical integrity or liquidity signals.\n`
  );
}

function normalizeStipulations(stips) {
  if (!Array.isArray(stips)) return [];
  return stips
    .filter((s) => s && (s.title || s.description))
    .map((s, i) => ({
      id: s.id || `stip-${i + 1}`,
      title: String(s.title || s.description || '').trim(),
      reason: s.reason ? String(s.reason).trim() : undefined
    }));
}

function normalizeVeraPayload(raw, meta = {}) {
  let decision = String(raw?.decision || 'STIPULATE').toUpperCase();
  if (!DECISIONS.includes(decision)) decision = 'STIPULATE';

  let bankabilityScore = Number(raw?.bankabilityScore);
  if (!Number.isFinite(bankabilityScore)) bankabilityScore = 5;
  bankabilityScore = Math.min(10, Math.max(1, Math.round(bankabilityScore * 10) / 10));

  const briefingMarkdown = String(raw?.briefingMarkdown || '').trim();
  if (!briefingMarkdown) {
    throw new Error('Vera briefing missing briefingMarkdown');
  }

  return {
    decision,
    bankabilityScore,
    stipulations: normalizeStipulations(raw?.stipulations),
    briefingMarkdown,
    metadata: {
      generatedAt: new Date().toISOString(),
      model: meta.model || VERA_MODEL,
      durationMs: meta.durationMs ?? 0,
      fallback: meta.fallback ?? false,
      source: meta.source || 'gemini-structured'
    }
  };
}

/**
 * Deterministic fallback (v1) — also used when CRITICAL alerts gate before Gemini.
 */
export function generateVeraBriefingDeterministic({
  macroResult = {},
  applicationData = {},
  alerts = [],
  juniorUnderwriter = null
} = {}) {
  const app = applicationData || macroResult.applicationData || {};
  const companyName = app.companyName || app.dbaName || 'the applicant';
  const alertList = Array.isArray(alerts) ? alerts : alerts?.items || macroResult?.alerts || [];
  const critical = countBySeverity(alertList, 'CRITICAL');
  const high = countBySeverity(alertList, 'HIGH');
  const metrics = macroResult.metrics || macroResult.financialTotals || {};
  const nsf = Number(metrics.nsfCount) || 0;
  const jr = juniorUnderwriter || macroResult.juniorUnderwriter || {};
  const jrScore = Number(jr.overallScore) || 70;

  if (critical > 0) {
    return normalizeVeraPayload(
      {
        decision: 'DECLINE',
        bankabilityScore: 2,
        stipulations: [],
        briefingMarkdown: buildDeclineBriefing(
          companyName,
          alertList
            .filter((a) => String(a.severity).toUpperCase() === 'CRITICAL')
            .map((a) => a.message || a.title || a.code)
        )
      },
      { model: 'veraBriefingService-deterministic-gate', source: 'deterministic-gate' }
    );
  }

  let decision = 'STIPULATE';
  let bankabilityScore = Math.min(9.5, Math.max(3, jrScore / 10));
  if (jr.decision === 'DECLINE' || jrScore < 55) {
    decision = 'DECLINE';
    bankabilityScore = 3.5;
  } else if (jrScore >= 75 && nsf < 3 && high === 0) {
    decision = 'FUND';
    bankabilityScore = Math.min(9, bankabilityScore + 0.5);
  }

  const stips = [];
  if (nsf >= 3) {
    stips.push({
      id: `stip-nsf-${Date.now()}`,
      title: 'Written explanation for NSF events in the analysis window',
      reason: `${nsf} NSF occurrences detected`
    });
  }
  if (high > 0) {
    stips.push({
      id: `stip-high-${Date.now()}`,
      title: 'Resolve high-severity forensic alerts before funding',
      reason: `${high} HIGH severity alert(s)`
    });
  }

  const strengths =
    Number(metrics.netCashFlow) > 0
      ? 'Positive net cash flow with identifiable operating deposit patterns.'
      : 'Deposit cadence supports ongoing operations despite tight liquidity.';

  const risks =
    nsf >= 3
      ? 'NSF activity suggests short-term liquidity stress.'
      : high > 0
        ? 'Open high-severity forensic flags require underwriter review.'
        : 'Revenue variance vs. application may need documentation.';

  const md =
    `# Executive Underwriting Briefing\n\n` +
    `**Decision:** ${decision}   **Bankability:** ${bankabilityScore.toFixed(1)}/10\n\n` +
    `## Deal Context\n\n- **Applicant:** ${companyName}\n\n` +
    `## Single Biggest Strength\n\n${strengths}\n\n` +
    `## Single Biggest Risk\n\n${risks}\n\n` +
    (decision === 'STIPULATE'
      ? `## What Would Change My Mind\n\n${stips.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}\n\n`
      : '') +
    `## Underwriter Recommendation\n\nRecommend **${decision}** based on forensic and 5 C's review.\n`;

  return normalizeVeraPayload(
    { decision, bankabilityScore, stipulations: stips, briefingMarkdown: md },
    { model: 'veraBriefingService-deterministic', source: 'deterministic' }
  );
}

/**
 * Gemini 2.5 Pro — native JSON schema (responseSchema).
 */
export async function generateVeraBriefingWithGemini(ctx) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not set for Vera briefing');
  }

  const alertList = Array.isArray(ctx.alerts) ? ctx.alerts : ctx.alerts?.items || ctx.macroResult?.alerts || [];
  if (countBySeverity(alertList, 'CRITICAL') > 0) {
    return generateVeraBriefingDeterministic(ctx);
  }

  const startMs = Date.now();
  const dealPackage = compactDealPackage(ctx);
  const userPrompt = `Analyze this commercial banking deal package and return the structured underwriting verdict JSON.

\`\`\`json
${JSON.stringify(dealPackage, null, 2)}
\`\`\``;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: VERA_MODEL,
    systemInstruction: SENIOR_UW_SYSTEM,
    generationConfig: {
      temperature: Number(process.env.VERA_BRIEFING_TEMPERATURE || 0.25),
      responseMimeType: 'application/json',
      responseSchema: VERA_RESPONSE_SCHEMA
    }
  });

  const result = await model.generateContent(userPrompt);
  const text = typeof result.response?.text === 'function' ? result.response.text() : '';
  let parsed = extractJsonObject(text);
  if (!parsed && text) {
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      parsed = null;
    }
  }
  if (!parsed) {
    throw new Error('Gemini returned no parseable Vera briefing JSON');
  }

  const durationMs = Date.now() - startMs;
  logger.info('[veraBriefingService] Gemini briefing complete', {
    decision: parsed.decision,
    bankabilityScore: parsed.bankabilityScore,
    durationMs
  });

  return normalizeVeraPayload(parsed, {
    model: VERA_MODEL,
    durationMs,
    source: `${VERA_MODEL}-structured`
  });
}

/**
 * Main entry: v2 → Gemini (when flagged), else deterministic v1.
 */
export async function generateVeraBriefing(ctx = {}) {
  const alertList = Array.isArray(ctx.alerts) ? ctx.alerts : ctx.alerts?.items || ctx.macroResult?.alerts || [];
  if (countBySeverity(alertList, 'CRITICAL') > 0) {
    return generateVeraBriefingDeterministic(ctx);
  }

  if (useVeraBriefingV2() || ctx.forceGemini) {
    return generateVeraBriefingWithGemini(ctx);
  }

  return generateVeraBriefingDeterministic(ctx);
}

export async function generateVeraBriefingOrMock(ctx) {
  const useMock = String(process.env.USE_MOCK_SERVICES ?? 'true').toLowerCase();
  if (useMock === 'true' || useMock === '1') {
    return structuredClone(loadContractMocks().vera);
  }
  return generateVeraBriefing(ctx);
}

export default {
  useVeraBriefingV2,
  generateVeraBriefing,
  generateVeraBriefingDeterministic,
  generateVeraBriefingWithGemini,
  generateVeraBriefingOrMock,
  mapPerplexityFundingToVeraDecision
};
