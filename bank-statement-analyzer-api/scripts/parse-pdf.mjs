#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PDFParserService } from '../src/services/pdfParserService.js';
import { PerplexityService } from '../src/services/perplexityService.js';
import llmCategorization from '../src/services/llmCategorizationService.js';

const normalizeCurrencyValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) {
      return null;
    }
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const normalizeDateString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  const str = String(value).trim();
  if (!str) {
    return null;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return str;
};

const normalizeIntegerValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  return rounded >= 0 ? rounded : null;
};

const categorizeTransactions = async (transactions) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      categorizedTransactions: [],
      categorySummary: {},
      topCategories: [],
      categorizationStats: {
        totalTransactions: Array.isArray(transactions) ? transactions.length : 0,
        categorizedCount: 0,
        averageConfidence: null
      }
    };
  }

  const categorized = [];
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const transaction of transactions) {
    try {
      const analysis = await llmCategorization.categorizeTransaction(transaction);
      const category = analysis?.category || 'Uncategorized';
      const confidence = typeof analysis?.confidence === 'number' ? analysis.confidence : null;

      if (typeof confidence === 'number') {
        confidenceSum += confidence;
        confidenceCount += 1;
      }

      categorized.push({
        ...transaction,
        category,
        confidence,
        categorizationMethod: analysis?.method || null,
        categorizationReasoning: analysis?.reasoning || null,
        alternativeCategories: Array.isArray(analysis?.alternativeCategories) && analysis.alternativeCategories.length
          ? analysis.alternativeCategories
          : null
      });
    } catch (error) {
      categorized.push({
        ...transaction,
        category: 'Uncategorized',
        confidence: 0,
        categorizationMethod: 'error',
        categorizationError: error.message
      });
    }
  }

  const summary = categorized.reduce((acc, transaction) => {
    const category = transaction.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = {
        count: 0,
        totalAmount: 0,
        creditTotal: 0,
        debitTotal: 0
      };
    }

    acc[category].count += 1;

    if (typeof transaction.amount === 'number') {
      acc[category].totalAmount += transaction.amount;
      if (transaction.amount >= 0) {
        acc[category].creditTotal += transaction.amount;
      } else {
        acc[category].debitTotal += transaction.amount;
      }
    }

    return acc;
  }, {});

  const topCategories = Object.entries(summary)
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalAmount: Number.isFinite(data.totalAmount) ? Number(data.totalAmount.toFixed(2)) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    categorizedTransactions: categorized,
    categorySummary: summary,
    topCategories,
    categorizationStats: {
      totalTransactions: transactions.length,
      categorizedCount: categorized.filter(tx => tx.category && tx.category !== 'Uncategorized').length,
      averageConfidence: confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(3)) : null
    }
  };
};

async function processSingleFile(filePath, bankType) {
  try {
    const parser = new PDFParserService();
    const cliArgs = process.argv.slice(2);
    const includeRawText = cliArgs.includes('--includeRawText');
    
    const options = { includeRawText };
    if (bankType) {
      options.bankType = bankType;
    }

    const result = await parser.parsePDF(filePath, options);

    if (!result) {
      throw new Error('PDF parsing returned no result.');
    }

    const hasRawText = typeof result?.rawText === 'string' && result.rawText.trim().length > 0;
    const balances = result?.balances || {};
    const periodSource = result?.statementPeriod || result?.metadata?.statementPeriod || result?.accountInfo?.statementPeriod || {};

    const existingOpening = normalizeCurrencyValue(balances.opening ?? result?.openingBalance);
    const existingClosing = normalizeCurrencyValue(balances.closing ?? result?.closingBalance);
    const existingAvailable = normalizeCurrencyValue(balances.available ?? result?.availableBalance);
    const existingPeriodStart = periodSource?.start ?? null;
    const existingPeriodEnd = periodSource?.end ?? null;
    const existingAverageDaily = normalizeCurrencyValue(result?.averageDailyBalance ?? result?.analytics?.averageDailyBalance);
    const existingAverageLedger = normalizeCurrencyValue(result?.averageLedgerBalance ?? result?.analytics?.averageLedgerBalance);
    const existingNsfEvents = result?.nsfEvents ?? result?.analytics?.nsfEvents ?? null;

    const missingFlags = {
      openingBalance: existingOpening === null,
      closingBalance: existingClosing === null,
      availableBalance: existingAvailable === null,
      statementPeriodStart: !existingPeriodStart,
      statementPeriodEnd: !existingPeriodEnd,
      averageDailyBalance: existingAverageDaily === null,
      averageLedgerBalance: existingAverageLedger === null,
      nsfEvents: existingNsfEvents === null || existingNsfEvents === undefined
    };

    let aiFieldExtraction = null;
    if (
      hasRawText &&
      Object.values(missingFlags).some(Boolean)
    ) {
      try {
        const perplexityService = new PerplexityService();
        const aiContext = {
          bankName: result?.bankName || result?.metadata?.bankName || null,
          closingBalance: existingClosing,
          availableBalance: existingAvailable,
          statementPeriod: {
            start: existingPeriodStart || null,
            end: existingPeriodEnd || null
          }
        };

        const aiExtraction = await perplexityService.extractStatementFields(result.rawText, aiContext);
        const appliedFields = [];

        const applyBalance = () => {
          if (!result.balances || typeof result.balances !== 'object') {
            result.balances = {};
          }
        };

        const aiOpening = normalizeCurrencyValue(aiExtraction.openingBalance);
        if (missingFlags.openingBalance && aiOpening !== null) {
          applyBalance();
          result.balances.opening = aiOpening;
          result.openingBalance = aiOpening;
          appliedFields.push('openingBalance');
        }

        const aiClosing = normalizeCurrencyValue(aiExtraction.closingBalance);
        if (missingFlags.closingBalance && aiClosing !== null) {
          applyBalance();
          result.balances.closing = aiClosing;
          result.closingBalance = aiClosing;
          appliedFields.push('closingBalance');
        }

        const aiAvailable = normalizeCurrencyValue(aiExtraction.availableBalance);
        if (missingFlags.availableBalance && aiAvailable !== null) {
          applyBalance();
          result.balances.available = aiAvailable;
          result.availableBalance = aiAvailable;
          appliedFields.push('availableBalance');
        }

        const aiPeriodStart = normalizeDateString(aiExtraction.statementPeriod?.start ?? null);
        if (missingFlags.statementPeriodStart && aiPeriodStart) {
          if (!result.statementPeriod || typeof result.statementPeriod !== 'object') {
            result.statementPeriod = {};
          }
          result.statementPeriod.start = aiPeriodStart;
          appliedFields.push('statementPeriod.start');
        }

        const aiPeriodEnd = normalizeDateString(aiExtraction.statementPeriod?.end ?? null);
        if (missingFlags.statementPeriodEnd && aiPeriodEnd) {
          if (!result.statementPeriod || typeof result.statementPeriod !== 'object') {
            result.statementPeriod = {};
          }
          result.statementPeriod.end = aiPeriodEnd;
          appliedFields.push('statementPeriod.end');
        }

        const aiAverageDaily = normalizeCurrencyValue(aiExtraction.averageDailyBalance);
        if (missingFlags.averageDailyBalance && aiAverageDaily !== null) {
          result.averageDailyBalance = aiAverageDaily;
          appliedFields.push('averageDailyBalance');
        }

        const aiAverageLedger = normalizeCurrencyValue(aiExtraction.averageLedgerBalance);
        if (missingFlags.averageLedgerBalance && aiAverageLedger !== null) {
          result.averageLedgerBalance = aiAverageLedger;
          appliedFields.push('averageLedgerBalance');
        }

        const aiNsf = normalizeIntegerValue(aiExtraction.nsfEvents);
        if (missingFlags.nsfEvents && aiNsf !== null) {
          result.nsfEvents = aiNsf;
          appliedFields.push('nsfEvents');
        }

        aiFieldExtraction = {
          ...aiExtraction,
          appliedFields,
          extractedAt: new Date().toISOString(),
          source: 'perplexity-cli'
        };
      } catch (aiError) {
        aiFieldExtraction = {
          error: aiError.message,
          attemptedAt: new Date().toISOString()
        };
      }
    }

    if (result?.rawText) {
      if (process.env.DUMP_RAW_TEXT && includeRawText) {
        const dumpTarget = process.env.DUMP_RAW_TEXT.trim();
        try {
          if (dumpTarget.toLowerCase() === 'stdout') {
            console.error(result.rawText);
          } else {
            const dumpPath = path.resolve(dumpTarget);
            fs.writeFileSync(dumpPath, result.rawText, 'utf8');
            console.error(`Raw text written to ${dumpPath}`);
          }
        } catch (dumpError) {
          console.error(`Failed to write raw text dump: ${dumpError.message}`);
        }
      }
      delete result.rawText;
    }

    const {
      categorizedTransactions,
      categorySummary,
      topCategories,
      categorizationStats
    } = await categorizeTransactions(result.transactions);

    result.categorizedTransactions = categorizedTransactions;

    const snapshot = {
      file: path.basename(filePath),
      bankName: result.bankName || result.metadata?.bankName || null,
      bankType: result.metadata?.bankType || null,
      statementPeriod: result.statementPeriod || result.metadata?.statementPeriod || null,
      balances: result.balances,
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
      availableBalance: result.availableBalance,
      averageDailyBalance: result.averageDailyBalance ?? null,
      averageLedgerBalance: result.averageLedgerBalance ?? null,
      nsfEvents: result.nsfEvents ?? null,
      transactionCount: Array.isArray(result.transactions) ? result.transactions.length : 0,
      sampleTransactions: Array.isArray(result.transactions) ? result.transactions.slice(0, 5) : [],
      categorizedTransactionsSample: categorizedTransactions.slice(0, 10),
      categorySummary,
      topCategories,
      categorizationStats,
      missingFieldsBeforeAi: missingFlags,
      aiFieldExtraction
    };

    console.log(JSON.stringify(snapshot, null, 2));
    console.log('---'); // Separator for multiple files
  } catch (error) {
    console.error(`\n--- ERROR processing ${path.basename(filePath)} ---`);
    console.error(error.message);
    console.log('---');
  }
}

async function findPdfFilesRecursive(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findPdfFilesRecursive(fullPath);
      } else if (path.extname(entry.name).toLowerCase() === '.pdf') {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat();
}

async function main() {
  if (!process.env.DUMP_RAW_TEXT) {
    process.env.DUMP_RAW_TEXT = 'stdout';
  }

  const argv = process.argv.slice(2);
  const bankTypeArg = argv.find(arg => arg.startsWith('--bankType'));
  const inputPath = argv.find(arg => !arg.startsWith('--'));

  if (!inputPath) {
    console.error('Usage: node scripts/parse-pdf.mjs <path-to-pdf-or-directory> [--bankType <type>]');
    process.exit(1);
  }

  const bankType = bankTypeArg ? bankTypeArg.split('=')[1] || argv[argv.indexOf(bankTypeArg) + 1] : null;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Path not found at '${resolvedPath}'`);
    process.exit(1);
  }

  const stats = await fs.promises.stat(resolvedPath);

  if (stats.isDirectory()) {
    console.log(`Processing all PDF files in directory: ${resolvedPath}\n`);
    const pdfFiles = await findPdfFilesRecursive(resolvedPath);

    if (pdfFiles.length === 0) {
      console.log('No PDF files found in the directory.');
      return;
    }

    for (const filePath of pdfFiles) {
      await processSingleFile(filePath, bankType);
    }
  } else {
    await processSingleFile(resolvedPath, bankType);
  }
}

main().catch(err => {
  console.error('An unexpected error occurred:', err);
  process.exit(1);
});
