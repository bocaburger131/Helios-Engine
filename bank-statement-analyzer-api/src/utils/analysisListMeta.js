/**
 * Portfolio list metadata for analysis cards (thin frontend).
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parsePeriodStart(m) {
  const cp = m?.coveragePeriod;
  if (cp?.startDate) return String(cp.startDate).slice(0, 10);
  if (cp?.start) return String(cp.start).slice(0, 10);
  if (m?.periodStart) return String(m.periodStart).slice(0, 10);
  const fn = String(m?.fileName || '');
  const match = fn.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i);
  if (match) {
    const yearMatch = fn.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : '2024';
    const idx = MONTH_NAMES.findIndex((x) => x.toUpperCase() === match[1].toUpperCase());
    if (idx >= 0) return `${year}-${String(idx + 1).padStart(2, '0')}-01`;
  }
  return null;
}

function formatMonthLabel(ymd) {
  if (!ymd || !/^\d{4}-\d{2}/.test(ymd)) return null;
  const [y, mo] = ymd.split('-');
  const idx = Number(mo) - 1;
  if (idx < 0 || idx > 11) return ymd;
  return `${MONTH_NAMES[idx]} ${y}`;
}

/**
 * @param {Array<{ coveragePeriod?: object, fileName?: string, periodStart?: string }>} monthlySummaries
 */
export function buildMonthsAnalyzedMeta(monthlySummaries = []) {
  const sorted = [...monthlySummaries]
    .map((m) => ({ m, start: parsePeriodStart(m) }))
    .filter((x) => x.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  const monthsAnalyzed = sorted.map((x) => x.start.slice(0, 7));
  const labels = sorted.map((x) => formatMonthLabel(x.start)).filter(Boolean);

  let monthsAnalyzedLabel = '';
  if (labels.length === 1) {
    monthsAnalyzedLabel = labels[0];
  } else if (labels.length > 1) {
    monthsAnalyzedLabel = `${labels[0]} → ${labels[labels.length - 1]}`;
  }

  const fileCount = monthlySummaries.length;
  if (fileCount > 0 && monthsAnalyzedLabel) {
    monthsAnalyzedLabel += ` (${fileCount} statement${fileCount === 1 ? '' : 's'})`;
  } else if (fileCount > 0) {
    monthsAnalyzedLabel = `${fileCount} statement${fileCount === 1 ? '' : 's'}`;
  }

  return { monthsAnalyzed, monthsAnalyzedLabel };
}

/**
 * @param {object} statement Mongoose doc or lean object
 * @param {object} [extras] from macroListExtras
 */
export function buildAnalysisListFields(statement, extras = {}) {
  const app = statement?.applicationContext || {};
  const analysis = statement?.analysis || {};
  const deal = analysis?.deal || {};

  const analysisTitle =
    app.companyName ||
    app.dbaName ||
    deal.companyName ||
    statement?.businessName ||
    'Unknown Company';

  const monthly = extras.monthlyStatementSummaries || [];
  const { monthsAnalyzed, monthsAnalyzedLabel } = buildMonthsAnalyzedMeta(monthly);

  const analyzedAt =
    analysis?.processing?.completedAt ||
    statement?.processedDate ||
    statement?.updatedAt ||
    statement?.createdAt ||
    statement?.uploadDate ||
    null;

  const veraDecision =
    analysis?.vera?.decision ||
    (statement?.metadata?.veraMetadata?.fundingDecision
      ? String(statement.metadata.veraMetadata.fundingDecision).replace(/\s+/g, '_').toUpperCase()
      : null);

  return {
    analysisTitle,
    monthsAnalyzed,
    monthsAnalyzedLabel,
    analyzedAt,
    veraDecision,
    statementCount: extras.statementCount ?? monthly.length ?? 1
  };
}

export default { buildAnalysisListFields, buildMonthsAnalyzedMeta };
