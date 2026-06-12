/**
 * Five-tier architectural validation for parsed bank statements (local, no LLM).
 */
import { validateReconciliation } from '../services/templateGraduationService.js';
import { buildParseResultForRecon } from './statementParseQuality.js';

const MONTH_NAME_MAP = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const DUPLICATE_LOOP_THRESHOLD = Number(process.env.VALIDATOR_DUPLICATE_LOOP_THRESHOLD) || 3;
const REVERSAL_WINDOW_MS = 48 * 60 * 60 * 1000;

function parseCoverageFromFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const base = fileName.replace(/\.[^/.]+$/, '');
  const short = base.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?$/i);
  if (short) {
    const y = new Date().getFullYear();
    const mon = MONTH_NAME_MAP[short[1].toLowerCase()];
    if (mon === undefined) return null;
    const lastDay = new Date(y, mon + 1, 0).getDate();
    const mm = String(mon + 1).padStart(2, '0');
    return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }
  const re =
    /(?:^|[_\s-])(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[_\s-]?(\d{4})(?:$|[_\s-])/i;
  const m = base.match(re);
  if (!m) return null;
  const mon = MONTH_NAME_MAP[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const y = Number(m[2]);
  const lastDay = new Date(y, mon + 1, 0).getDate();
  const mm = String(mon + 1).padStart(2, '0');
  return {
    startDate: `${y}-${mm}-01`,
    endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
  };
}

function resolveStatementPeriod(parsedStatement) {
  const pr = parsedStatement.parseResult;
  const sp = pr?.statementPeriod || pr?.accountInfo?.statementPeriod;
  if (sp?.start && sp?.end) {
    const start = new Date(sp.start);
    const end = new Date(sp.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
    }
  }
  const txs = parsedStatement.transactions || [];
  const dates = txs
    .map((t) => new Date(t.date || t.transactionDate))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length) {
    dates.sort((a, b) => a - b);
    return {
      startDate: dates[0].toISOString().slice(0, 10),
      endDate: dates[dates.length - 1].toISOString().slice(0, 10)
    };
  }
  const fromName = parseCoverageFromFileName(parsedStatement.fileName);
  if (fromName) return fromName;
  if (parsedStatement.statementDate) {
    const sd = new Date(parsedStatement.statementDate);
    if (!Number.isNaN(sd.getTime())) {
      const y = sd.getFullYear();
      const mo = sd.getMonth();
      const lastDay = new Date(y, mo + 1, 0).getDate();
      const mm = String(mo + 1).padStart(2, '0');
      return {
        startDate: `${y}-${mm}-01`,
        endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
      };
    }
  }
  return null;
}

function normalizeDesc(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function txnFingerprint(tx) {
  const date = String(tx.date || tx.transactionDate || '').slice(0, 10);
  const amt = Number(tx.amount);
  const amountKey = Number.isFinite(amt) ? Math.abs(amt).toFixed(2) : '0';
  const bal = tx.balance != null && Number.isFinite(Number(tx.balance)) ? Number(tx.balance).toFixed(2) : '';
  return `${date}|${amountKey}|${normalizeDesc(tx.description)}|${bal}`;
}

function validateStructural(parsedStatement, pdfMeta = {}) {
  const issues = [];
  const pr = parsedStatement.parseResult;
  const stitcher = parsedStatement.stitcher;
  const printed = stitcher?.typeA?.printed;
  const opening =
    printed?.opening != null
      ? printed.opening
      : parsedStatement.openingBalance ?? pr?.openingBalance ?? pr?.balances?.opening;
  const closing =
    printed?.closing != null
      ? printed.closing
      : parsedStatement.closingBalance ?? pr?.closingBalance ?? pr?.balances?.closing;

  if (opening == null || !Number.isFinite(Number(opening))) {
    issues.push('Missing opening balance anchor');
  }
  if (closing == null || !Number.isFinite(Number(closing))) {
    issues.push('Missing closing balance anchor');
  }

  const account =
    parsedStatement.accountNumber ||
    pr?.accountInfo?.accountNumber ||
    pr?.accountNumber;
  if (!account || String(account).replace(/\D/g, '').length < 4) {
    issues.push('Missing or invalid account number');
  }

  const period = resolveStatementPeriod(parsedStatement);
  if (!period?.startDate) {
    issues.push('Statement period or statement date not detected');
  }

  const pdfPages = pdfMeta.numpages ?? pdfMeta.numPages ?? null;
  const stitcherPages = stitcher?.pages ?? pr?.metadata?.stitcher?.pages ?? null;
  if (pdfPages != null && stitcherPages != null && Math.abs(Number(pdfPages) - Number(stitcherPages)) > 2) {
    issues.push(`Page count mismatch: PDF=${pdfPages} stitcher=${stitcherPages}`);
  }

  return { ok: issues.length === 0, issues, period, opening, closing, account };
}

function validateTemporal(parsedStatement, period) {
  const issues = [];
  if (!period?.startDate || !period?.endDate) {
    return { ok: false, issues: ['Cannot validate dates without statement period'] };
  }
  const startMs = new Date(`${period.startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${period.endDate}T23:59:59Z`).getTime();
  const txs = (parsedStatement.transactions || [])
    .map((t) => ({
      tx: t,
      ms: new Date(t.date || t.transactionDate).getTime()
    }))
    .filter((x) => Number.isFinite(x.ms));

  for (const { tx, ms } of txs) {
    if (ms < startMs - 86400000 || ms > endMs + 86400000) {
      issues.push(`Transaction outside period: ${tx.date || tx.transactionDate}`);
    }
  }

  let prevMs = null;
  let prevBal = null;
  for (const { tx, ms } of txs.sort((a, b) => a.ms - b.ms)) {
    if (prevMs != null && ms < prevMs - 86400000) {
      issues.push(`Chronological regression at ${tx.date || tx.transactionDate}`);
    }
    const bal = tx.balance != null ? Number(tx.balance) : null;
    if (prevBal != null && bal != null && Number.isFinite(bal) && bal < prevBal - 0.01 && ms > prevMs) {
      const amt = Number(tx.amount);
      if (!(Number.isFinite(amt) && amt > 0)) {
        issues.push(`Running balance regression at ${tx.date || tx.transactionDate}`);
      }
    }
    prevMs = ms;
    prevBal = bal;
  }

  return { ok: issues.length === 0, issues };
}

function validateDuplication(parsedStatement) {
  const txs = parsedStatement.transactions || [];
  const hashCounts = new Map();
  const reversalPairs = [];

  for (let i = 0; i < txs.length; i++) {
    const fp = txnFingerprint(txs[i]);
    hashCounts.set(fp, (hashCounts.get(fp) || 0) + 1);
  }

  const duplicateHashes = [...hashCounts.entries()]
    .filter(([, c]) => c >= DUPLICATE_LOOP_THRESHOLD)
    .map(([h, c]) => ({ hash: h, count: c }));

  for (let i = 0; i < txs.length; i++) {
    for (let j = i + 1; j < txs.length; j++) {
      const a = txs[i];
      const b = txs[j];
      const amtA = Number(a.amount);
      const amtB = Number(b.amount);
      if (!Number.isFinite(amtA) || !Number.isFinite(amtB)) continue;
      if (Math.sign(amtA) === Math.sign(amtB)) continue;
      if (Math.abs(Math.abs(amtA) - Math.abs(amtB)) > 0.01) continue;
      const tA = new Date(a.date || a.transactionDate).getTime();
      const tB = new Date(b.date || b.transactionDate).getTime();
      if (!Number.isFinite(tA) || !Number.isFinite(tB)) continue;
      if (Math.abs(tA - tB) <= REVERSAL_WINDOW_MS) {
        reversalPairs.push({ i, j });
      }
    }
  }

  const dupLoopCount = duplicateHashes.reduce((s, d) => s + d.count, 0);
  const reversalExempt = reversalPairs.length;
  const ok = duplicateHashes.length === 0 || dupLoopCount <= reversalExempt + 1;

  return {
    ok,
    duplicateHashes,
    reversalPairs: reversalPairs.slice(0, 20),
    issues: ok ? [] : ['Duplicate transaction fingerprint loop detected']
  };
}

function validateRisk(parsedStatement) {
  const flags = [];
  const txs = parsedStatement.transactions || [];
  if (txs.length === 0) return { flags, forensicMetadata: {} };

  let roundDollar = 0;
  let weekend = 0;
  for (const tx of txs) {
    const amt = Math.abs(Number(tx.amount));
    if (Number.isFinite(amt) && amt >= 100 && Math.abs(amt % 100) < 0.01) roundDollar += 1;
    const d = new Date(tx.date || tx.transactionDate);
    if (!Number.isNaN(d.getTime()) && (d.getDay() === 0 || d.getDay() === 6)) weekend += 1;
  }

  const roundPct = roundDollar / txs.length;
  if (roundPct > 0.35) {
    flags.push({
      code: 'ROUND_DOLLAR_SPIKE',
      severity: 'MEDIUM',
      message: `${(roundPct * 100).toFixed(0)}% of transactions are round-dollar amounts`
    });
  }
  if (weekend / txs.length > 0.25) {
    flags.push({
      code: 'WEEKEND_CLEARING',
      severity: 'LOW',
      message: `${((weekend / txs.length) * 100).toFixed(0)}% of activity on weekends`
    });
  }
  if (txs.length > 400) {
    flags.push({
      code: 'HIGH_TXN_VOLUME',
      severity: 'MEDIUM',
      message: `High transaction count (${txs.length}) — verify parser bleed`
    });
  }

  return {
    flags,
    forensicMetadata: {
      roundDollarPct: roundPct,
      weekendPct: weekend / txs.length,
      transactionCount: txs.length
    }
  };
}

/**
 * Run all five validation tiers on a parsed statement row.
 * @param {object} parsedStatement
 * @param {object} [options]
 * @returns {object}
 */
export function validateStatement(parsedStatement, options = {}) {
  const pdfMeta = {
    numpages:
      options.pdfMeta?.numpages ??
      parsedStatement.pdfPageCount ??
      parsedStatement.parseResult?.metadata?.pageCount ??
      null,
    ...(options.pdfMeta || {})
  };

  const reconInput = buildParseResultForRecon(parsedStatement);
  const arithmetic = validateReconciliation(reconInput);
  const structural = validateStructural(parsedStatement, pdfMeta);
  const temporal = validateTemporal(parsedStatement, structural.period);
  const duplication = validateDuplication(parsedStatement);
  const risk = validateRisk(parsedStatement);

  const blockingOk =
    structural.ok && arithmetic.ok && temporal.ok && duplication.ok;

  return {
    structural,
    arithmetic,
    temporal,
    duplication,
    risk,
    overallOk: blockingOk,
    forensicMetadata: {
      ...(risk.forensicMetadata || {}),
      fileName: parsedStatement.fileName,
      validationTiers: {
        structural: structural.ok,
        arithmetic: arithmetic.ok,
        temporal: temporal.ok,
        duplication: duplication.ok
      }
    }
  };
}

export const StatementValidator = { validate: validateStatement };

export default { validateStatement, StatementValidator };
