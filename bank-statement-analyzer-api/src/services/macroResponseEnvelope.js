import { loadContractMocks, useMockServices } from '../contracts/loadContractMocks.js';
import { evaluateJuniorUnderwriterOrMock } from './juniorUnderwriterService.js';
import { generateVeraBriefingDeterministic } from './veraBriefingService.js';

/**
 * Build deal header from application / anchor data.
 */
function buildDealContext(applicationData = {}, body = {}) {
  return {
    companyName:
      applicationData.companyName ||
      applicationData.dbaName ||
      body.businessName ||
      null,
    dba: applicationData.dbaName || null,
    taxId: applicationData.taxId || null,
    businessAddress: applicationData.businessAddress || null,
    requestedLoanAmount:
      applicationData.requestedLoanAmount ??
      applicationData.requestedAmount ??
      (Number.isFinite(parseFloat(body.requestedLoanAmount))
        ? parseFloat(body.requestedLoanAmount)
        : null),
    statedGAR:
      applicationData.statedRevenue ??
      applicationData.annualRevenue ??
      applicationData.statedGAR ??
      null,
    dealId: body.dealId || applicationData.dealId || null
  };
}

function buildCoverage(consolidatedMacroAnalysis, parsedStatementCount, accountGroupCount) {
  const agg = consolidatedMacroAnalysis?.financialTotals || {};
  const range = agg.dateRange || consolidatedMacroAnalysis?.metadata?.dateRange || {};
  return {
    startDate: range.startDate || range.start || null,
    endDate: range.endDate || range.end || null,
    daysCovered: range.daysCovered ?? agg.periodDays ?? null,
    fileCount: consolidatedMacroAnalysis?.summary?.statementPDFs ?? parsedStatementCount ?? 0,
    accountCount: consolidatedMacroAnalysis?.summary?.totalAccountGroups ?? accountGroupCount ?? 0
  };
}

function buildMetrics(macroAgg, consolidatedMacroAnalysis) {
  const ft = consolidatedMacroAnalysis?.financialTotals || {};
  const vitals = consolidatedMacroAnalysis?.underwritingVitals || null;
  return {
    totalDeposits: macroAgg?.totalDeposits ?? ft.totalDeposits ?? 0,
    totalWithdrawals: macroAgg?.totalWithdrawals ?? ft.totalWithdrawals ?? 0,
    netCashFlow: macroAgg?.netCashFlow ?? ft.netCashFlow ?? 0,
    averageDailyBalance:
      vitals?.adb?.l3mAverage ?? macroAgg?.averageDailyBalance ?? ft.averageDailyBalance ?? 0,
    nsfCount:
      vitals?.nsfAndOverdraft?.nsfCount ?? macroAgg?.nsfCount ?? ft.nsfCount ?? 0,
    trueL3mRevenueAverage: vitals?.revenue?.l3mTrueRevenueAverage ?? null,
    negativeDayCount: vitals?.liquidity?.negativeDayCount ?? null,
    mcaStackingDetected: vitals?.mcaStacking?.detected ?? null,
    openingBalance: macroAgg?.openingBalance ?? ft.openingBalance ?? 0,
    closingBalance: macroAgg?.closingBalance ?? ft.closingBalance ?? 0,
    underwritingVitals: vitals,
    ...(macroAgg && typeof macroAgg === 'object' ? macroAgg : {})
  };
}

function buildAlertsBlock(allAlerts = []) {
  const items = Array.isArray(allAlerts) ? allAlerts : [];
  const count = (sev) => items.filter((a) => String(a.severity).toUpperCase() === sev).length;
  return {
    critical: count('CRITICAL'),
    high: count('HIGH'),
    medium: count('MEDIUM'),
    low: count('LOW'),
    items
  };
}

/**
 * UI-ready 201 response envelope for macro batch.
 */
export function buildMacroResponseEnvelope({
  statementId,
  message,
  consolidatedMacroAnalysis,
  macroAgg,
  allAlerts = [],
  accountGroupResults = [],
  applicationData = {},
  extractedAnchorData = {},
  legacyReport = null,
  vera: veraOverride = null,
  parsedStatementCount = 0,
  parseQualityByFile = null,
  checksumRecovery = null,
  reqBody = {},
  skippedFiles
}) {
  const mocks = loadContractMocks();
  const mockMode = useMockServices();

  const appData = {
    ...(extractedAnchorData && typeof extractedAnchorData === 'object' ? extractedAnchorData : {}),
    ...(applicationData && typeof applicationData === 'object' ? applicationData : {}),
    ...(consolidatedMacroAnalysis?.applicationData || {})
  };

  const metricsForJr = buildMetrics(macroAgg, consolidatedMacroAnalysis);
  const alertsBlock = buildAlertsBlock(allAlerts);

  const accountingSummary = mockMode
    ? structuredClone(mocks.accountingSummary)
    : consolidatedMacroAnalysis?.accountingSummary ?? null;

  const juniorUnderwriter =
    consolidatedMacroAnalysis?.juniorUnderwriter ??
    evaluateJuniorUnderwriterOrMock({
      macroResult: consolidatedMacroAnalysis,
      metrics: metricsForJr,
      alerts: alertsBlock
    });

  const veraFromAnalysis = consolidatedMacroAnalysis?.vera ?? null;
  const veraGenerated =
    veraOverride ||
    veraFromAnalysis ||
    (mockMode
      ? structuredClone(mocks.vera)
      : generateVeraBriefingDeterministic({
          macroResult: { ...consolidatedMacroAnalysis, juniorUnderwriter, metrics: metricsForJr },
          applicationData: appData,
          alerts: allAlerts,
          juniorUnderwriter
        }));
  const vera = veraGenerated || {
    decision: null,
    bankabilityScore: null,
    briefingMarkdown: legacyReport || null,
    stipulations: [],
    generatedAt: new Date().toISOString(),
    model: 'gemini-2.5-pro'
  };

  const briefingMarkdown =
    vera.briefingMarkdown || legacyReport || consolidatedMacroAnalysis?.report || null;

  const data = {
    id: statementId,
    deal: buildDealContext(appData, reqBody),
    coverage: buildCoverage(
      consolidatedMacroAnalysis,
      parsedStatementCount,
      accountGroupResults.length
    ),
    metrics: buildMetrics(macroAgg, consolidatedMacroAnalysis),
    accountingSummary,
    juniorUnderwriter,
    forensicIntelligence: consolidatedMacroAnalysis?.forensicIntelligence ?? null,
    underwritingVitals: consolidatedMacroAnalysis?.underwritingVitals ?? null,
    alerts: alertsBlock,
    accountGroups: accountGroupResults,
    vera: {
      ...vera,
      briefingMarkdown
    },
    applicationData: appData,
    legacy: {
      report: briefingMarkdown
    },
    report: briefingMarkdown,
    ...consolidatedMacroAnalysis
  };

  // Ensure envelope fields win over spread duplicates
  data.accountingSummary = accountingSummary;
  data.juniorUnderwriter = juniorUnderwriter;
  data.applicationData = appData;
  data.vera = { ...vera, briefingMarkdown };
  data.deal = buildDealContext(appData, reqBody);
  data.coverage = buildCoverage(
    consolidatedMacroAnalysis,
    parsedStatementCount,
    accountGroupResults.length
  );
  data.metrics = buildMetrics(macroAgg, consolidatedMacroAnalysis);
  data.alerts = alertsBlock;
  data.accountGroups = accountGroupResults;
  if (parseQualityByFile?.length) {
    data.parseQualityByFile = parseQualityByFile;
  }

  const envelope = {
    success: true,
    message: message || mocks.envelope201.message,
    applicationData: appData,
    data,
    ...(skippedFiles?.length ? { skippedFiles } : {}),
    ...(checksumRecovery?.attempted ? { checksumRecovery } : {})
  };

  if (mockMode) {
    envelope._mock = true;
    envelope._mockSource = 'src/contracts/mocks';
  }

  return envelope;
}

export default { buildMacroResponseEnvelope, useMockServices };
