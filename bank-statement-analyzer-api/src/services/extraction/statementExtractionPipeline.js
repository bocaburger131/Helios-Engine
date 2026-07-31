/**
 * Universal four-step bank statement extraction pipeline.
 */
import logger from '../../utils/logger.js';
import { validateEndingDailyBalancePlacement } from './statementReconciliation.js';
import { reconcileRawBundle } from './layoutPipeline/reconciliationService.js';
import { WellsParseReconciliationError } from './profiles/wellsFargoInitiateProfile.js';
import { ChaseParseReconciliationError } from './profiles/chaseBusinessCompleteProfile.js';
import {
  extractTransactionsFromPdfBuffer as ocrExtractFromBuffer,
  scanOcrEnabled
} from './scanOcrService.js';
import { identifyFailingSection } from '../sectionDiagnostic.js';
import { runSectionDiagnostic } from '../aiDiagnosticService.js';
import { resolveGeminiApiKey } from '../geminiVisionService.js';
import { attemptColumnFlipRepair } from './checksumFailureMatrix.js';
import { extractTransactionsFromPdfBuffer as plumberReExtract } from './pdfPlumberService.js';
import { classifyRescueItems, dispatchRescueBatches, applyRepairs, RESCUE_MODES, RESCUE_PROMPT_VERSION } from './aiRescueDispatcher.js';
import { buildRescueCacheKey, getCachedRescue, setCachedRescue } from './rescueCache.js';
import * as aiOrchestrator from '../aiOrchestratorService.js';
import crypto from 'node:crypto';

/**
 * @param {object} ctx
 * @param {string} ctx.text — full pdf-parse text
 * @param {{ id: string, extract: Function, confidence?: number }} ctx.profile
 * @param {object} [ctx.parserService]
 * @param {object} [ctx.options]
 * @param {string} [ctx.resolvedBankType]
 * @param {number} [ctx.defaultYear]
 * @returns {Promise<object>}
 */
export async function runStatementExtractionPipeline(ctx) {
  const { text, profile } = ctx;
  const started = Date.now();

  let extracted;
  try {
    if (profile.id === 'generic_digital' || profile.id === 'chase_business_complete') {
      extracted = await profile.extract(ctx);
    } else {
      extracted = await profile.extract({
        text,
        altText: ctx.altText,
        defaultYear: ctx.defaultYear
      });
    }
  } catch (e) {
    if (e instanceof WellsParseReconciliationError) {
      logger.warn('[STATEMENT_PIPELINE] Wells reconciliation gate failed — constructing partial for rescue', {
        profileId: profile.id,
        parsedDeposits: e.reconciliation?.parsedDeposits,
        printedDeposits: e.reconciliation?.printedDeposits
      });
      if (!e.partial?.transactions?.length) throw e;
      extracted = {
        meta: e.partial.meta,
        normalizedTransactions: e.partial.normalizedTransactions,
        transactions: e.partial.transactions,
        reconciliation: e.reconciliation
      };
    } else if (e instanceof ChaseParseReconciliationError) {
      logger.warn('[STATEMENT_PIPELINE] Chase reconciliation gate failed — constructing partial for rescue', {
        profileId: profile.id,
        parsedDeposits: e.reconciliation?.parsedDeposits,
        printedDeposits: e.reconciliation?.printedDeposits
      });
      if (!e.partial?.transactions?.length) throw e;
      extracted = {
        meta: e.partial.meta,
        normalizedTransactions: e.partial.normalizedTransactions,
        transactions: e.partial.transactions,
        reconciliation: e.reconciliation
      };
    } else {
      logger.warn('[STATEMENT_PIPELINE] profile extract failed', {
        profileId: profile.id,
        error: e.message
      });
      // Plan risk mitigation: rescue runs on Python output independently of
      // the profile. If the profile died but plumber evidence exists, fall
      // through with a plumber-based extracted so the rescue dispatcher can
      // still run. Only hard-throw when there is no plumber fallback.
      if (ctx.plumberTransactions?.length) {
        logger.warn('[STATEMENT_PIPELINE] falling through with plumber evidence', {
          profileId: profile.id,
          txnCount: ctx.plumberTransactions.length,
          droppedRows: ctx.plumberDroppedRows?.length ?? 0,
          uncertainAssignments: ctx.plumberUncertainAssignments?.length ?? 0,
        });
        extracted = {
          meta: {
            openingBalance: ctx.plumberMeta?.openingBalance ?? null,
            closingBalance: ctx.plumberMeta?.closingBalance ?? null,
            extractionSource: 'pdfplumber',
          },
          normalizedTransactions: ctx.plumberTransactions,
          transactions: ctx.plumberTransactions,
          droppedRows: ctx.plumberDroppedRows || [],
          uncertainAssignments: ctx.plumberUncertainAssignments || [],
          reconciliation: null,
          _plumberReplaced: true,
          _profileFailed: true,
        };
      } else {
        throw e;
      }
    }
  }

  // ── P0: Use pdfplumber transactions when available ──────────────────────────
  // The Python sidecar assigns correct signs from column position
  // (deposits column → CREDIT, withdrawals column → DEBIT). When the
  // dual engine chose pdfplumber, use those transactions directly instead
  // of the profile's description-guessed signs.
  if (ctx.plumberTransactions?.length && !extracted._plumberReplaced) {
    // Use pdfplumber transactions directly — they have correct
    // column-position signs (deposits→CREDIT, withdrawals→DEBIT).
    // The profile's description-guessed signs are wrong for 90%+ of rows.
    logger.info('[STATEMENT_PIPELINE] replacing profile transactions with plumber', {
      profileTxnCount: extracted.transactions?.length ?? 0,
      plumberTxnCount: ctx.plumberTransactions.length,
      droppedRows: ctx.plumberDroppedRows?.length ?? 0,
      uncertainAssignments: ctx.plumberUncertainAssignments?.length ?? 0,
    });
    extracted.transactions = ctx.plumberTransactions;
    extracted.normalizedTransactions = ctx.plumberTransactions;
    extracted.droppedRows = ctx.plumberDroppedRows || extracted.droppedRows || [];
    extracted.uncertainAssignments =
      ctx.plumberUncertainAssignments || extracted.uncertainAssignments || [];
    extracted._plumberReplaced = true;
  }
  // ── end plumber sign correction ─────────────────────────────────────────────

  // Always attach plumber evidence when present (even if profile txns retained)
  if (!extracted.droppedRows?.length && ctx.plumberDroppedRows?.length) {
    extracted.droppedRows = ctx.plumberDroppedRows;
  }
  if (!extracted.uncertainAssignments?.length && ctx.plumberUncertainAssignments?.length) {
    extracted.uncertainAssignments = ctx.plumberUncertainAssignments;
  }
  // RAW_WORD fallback tier evidence: full word inventory of unknown layouts.
  if (!extracted.rawWordRows?.length && ctx.plumberRawWordRows?.length) {
    extracted.rawWordRows = ctx.plumberRawWordRows;
  }

  const meta = {
    ...extracted.meta,
    extractionProfile: profile.id,
    profileConfidence: ctx.profile?.confidence ?? null
  };

  let reconciliation = extracted.reconciliation;
  if (!reconciliation) {
    const reconResult = reconcileRawBundle(
      {
        transactions: extracted.transactions,
        normalizedTransactions: extracted.normalizedTransactions,
        meta,
        printedVitals: {
          opening: meta.openingBalance,
          closing: meta.closingBalance,
          deposits: meta.printedDeposits,
          withdrawals: meta.printedWithdrawals
        },
        extractionMode: 'profile_strict'
      },
      { profileId: profile.id }
    );
    reconciliation = reconResult.reconciliationBreakdown;
  }

  let dailyBalanceRule = { valid: true, violations: 0 };
  if (extracted.normalizedTransactions?.length) {
    dailyBalanceRule = validateEndingDailyBalancePlacement(extracted.normalizedTransactions);
  }

  const extractionTier = reconciliation.checksumOk && dailyBalanceRule.valid ? 1 : null;

  // ── OCR rescue pass ────────────────────────────────────────────────────────
  // If the primary extraction failed checksum and we have the raw buffer,
  // attempt a second pass through the OCR/scan pipeline.  If OCR produces a
  // result that passes reconciliation we swap it in; otherwise we keep the
  // original (non-fatal).
  let ocrRescueApplied = false;
  let ocrRescueFailed = false;

  if (!reconciliation.checksumOk && ctx.pdfBuffer && scanOcrEnabled()) {
    logger.info('[STATEMENT_PIPELINE] checksum failed — attempting OCR rescue', {
      profileId: profile.id,
      txnCount: extracted.transactions?.length ?? 0
    });

    try {
      const ocrResult = await ocrExtractFromBuffer(ctx.pdfBuffer, {
        bankName: ctx.resolvedBankType || '',
        defaultYear: ctx.defaultYear,
        fileName: ctx.options?.fileName
      });

      if (ocrResult?.success && ocrResult.transactions?.length) {
        const ocrBundle = reconcileRawBundle(
          {
            transactions: ocrResult.transactions,
            normalizedTransactions: ocrResult.normalizedTransactions ?? ocrResult.transactions,
            meta: {
              openingBalance: ocrResult.openingBalance,
              closingBalance: ocrResult.closingBalance
            },
            printedVitals: {
              opening: ocrResult.openingBalance,
              closing: ocrResult.closingBalance,
              deposits: null,
              withdrawals: null
            },
            extractionMode: 'ocr_rescue'
          },
          { profileId: profile.id }
        );

        if (ocrBundle.reconciliationBreakdown?.checksumOk) {
          // OCR pass succeeded — swap in its result
          extracted = {
            ...extracted,
            transactions: ocrResult.transactions,
            normalizedTransactions: ocrResult.normalizedTransactions ?? ocrResult.transactions
          };
          reconciliation = ocrBundle.reconciliationBreakdown;
          ocrRescueApplied = true;
          logger.info('[STATEMENT_PIPELINE] OCR rescue succeeded', {
            profileId: profile.id,
            txnCount: ocrResult.transactions.length
          });
        } else {
          ocrRescueFailed = true;
          logger.warn('[STATEMENT_PIPELINE] OCR rescue did not pass checksum', {
            profileId: profile.id
          });
        }
      } else {
        ocrRescueFailed = true;
        logger.warn('[STATEMENT_PIPELINE] OCR rescue returned no transactions', {
          profileId: profile.id,
          error: ocrResult?.error
        });
      }
    } catch (ocrErr) {
      ocrRescueFailed = true;
      logger.warn('[STATEMENT_PIPELINE] OCR rescue threw', {
        profileId: profile.id,
        error: ocrErr.message
      });
    }
  }
  // ── end OCR rescue ─────────────────────────────────────────────────────────

  // ── COLUMN_FLIP repair ────────────────────────────────────────────────────
  // Step 1.5: Bounded checksum failure repair.
  // If COLUMN_FLIP pattern detected (deposits inflated, withdrawals deflated),
  // attempt ONE sign inversion after verifying section/header semantics.
  let columnFlipRepaired = false;

  if (!reconciliation.checksumOk) {
    const flipResult = attemptColumnFlipRepair({
      transactions: extracted.transactions,
      reconciliation,
      reconcileFn: (txs, metaOverride) => {
        const reconResult = reconcileRawBundle(
          {
            transactions: txs,
            normalizedTransactions: txs,
            meta: metaOverride || extracted.meta,
            printedVitals: {
              opening: extracted.meta?.openingBalance,
              closing: extracted.meta?.closingBalance,
              deposits: reconciliation.printedDeposits,
              withdrawals: reconciliation.printedWithdrawals,
            },
            extractionMode: 'column_flip_repair',
          },
          { profileId: profile.id }
        );
        return reconResult.reconciliationBreakdown;
      },
      meta: extracted.meta,
    });

    if (flipResult.repaired) {
      extracted.transactions = flipResult.transactions;
      extracted.normalizedTransactions = flipResult.transactions;
      reconciliation = flipResult.reconciliation;
      columnFlipRepaired = true;
    }
  }
  // ── end COLUMN_FLIP repair ─────────────────────────────────────────────────

  // ── Section diagnostic + AI diagnostic ─────────────────────────────────────
  // Step 2: Section diagnostic (pure math — no API needed)
  // Identifies which section is most likely responsible for the checksum failure.
  let sectionDiagnostic = null;
  let aiDiagnosticResult = null;
  let aiRetryApplied = false;
  let rescueOutcome = 'RESCUE_SKIPPED';
  // Candidate overlay audit trail: every candidate the rescue evaluated,
  // with its reconciliation delta, so the dual-engine selector can score the
  // REPAIRED plumber candidate (not just the raw pre-repair branch).
  let rescueCandidates = null;

  if (!reconciliation.checksumOk) {
    const fullText = ctx.text || ctx.altText || '';
    const sectionLabels = ctx.sectionLabels || [];

    try {
      sectionDiagnostic = identifyFailingSection({
        transactions: extracted.transactions,
        sectionLabels,
        checksumRecon: {
          ok: reconciliation.checksumOk,
          deposits: reconciliation.parsedDeposits,
          withdrawals: reconciliation.parsedWithdrawals,
          computedClosing: reconciliation.computedClosing,
          closing: reconciliation.closing,
          delta: reconciliation.computedClosing != null && reconciliation.closing != null
            ? Number((reconciliation.computedClosing - reconciliation.closing).toFixed(2))
            : 0
        },
        fullText
      });
      logger.info('[STATEMENT_PIPELINE] section diagnostic', {
        ...sectionDiagnostic
      });
    } catch (e) {
      logger.warn('[STATEMENT_PIPELINE] section diagnostic failed', { error: e.message });
    }

    // Step 3: AI diagnostic (needs Gemini/Claude API key).
    // Skipped on an empty ledger: there is no checksum gap to diagnose when
    // zero transactions were extracted — RAW_LEDGER owns that case.
    if (extracted.transactions?.length && resolveGeminiApiKey()) {
      try {
        aiDiagnosticResult = await runSectionDiagnostic({
          transactions: extracted.transactions,
          reconciliation,
          fullText,
          sectionLabels,
          expectedClosingBalance: reconciliation.closing,
          expectedOpeningBalance: reconciliation.opening,
          calculatedClosingBalance: reconciliation.computedClosing,
          reconciliationBreakdown: reconciliation,
          pageTelemetry: ctx.pageTelemetry,
          layoutTextSample: fullText.slice(0, 4000),
          fileName: ctx.fileName,
          bankName: extracted.meta?.bankName,
          // Layout quality signals for enhanced AI diagnosis
          balanceCoverage: extracted.transactions?.length
            ? ((extracted.transactions.filter(t => t.balance != null).length / extracted.transactions.length) * 100).toFixed(1) + '%'
            : '0%',
          sectionCoverage: extracted.transactions?.length
            ? ((extracted.transactions.filter(t => t.sectionId && t.sectionId !== 'unknown' && t.sectionId !== 'primary_activity').length / extracted.transactions.length) * 100).toFixed(1) + '%'
            : '0%',
          // Column-level stats: helps AI distinguish column misalignment from data sparsity
          columnStats: extracted.transactions?.length
            ? (() => {
                const txs = extracted.transactions;
                const credits = txs.filter(t => t.amount > 0);
                const debits = txs.filter(t => t.amount < 0);
                return {
                  creditCount: credits.length,
                  debitCount: debits.length,
                  creditTotal: credits.reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2),
                  debitTotal: debits.reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2),
                  noBalanceCount: txs.filter(t => t.balance == null).length,
                  hasBalanceCount: txs.filter(t => t.balance != null).length,
                };
              })()
            : null,
          extractionStrategies: ctx.pageTelemetry
            ? [...new Set(ctx.pageTelemetry.map(p => p.strategy).filter(Boolean))]
            : null,
          columnFlipDetected: reconciliation.printedDeposits != null &&
            reconciliation.printedDeposits > 0 &&
            (reconciliation.parsedDeposits / reconciliation.printedDeposits) > 1.2,
          depositRatio: reconciliation.printedDeposits != null && reconciliation.printedDeposits > 0
            ? (reconciliation.parsedDeposits / reconciliation.printedDeposits).toFixed(2)
            : null,
          withdrawalRatio: reconciliation.printedWithdrawals != null && reconciliation.printedWithdrawals > 0
            ? (reconciliation.parsedWithdrawals / reconciliation.printedWithdrawals).toFixed(2)
            : null,
        });
        logger.info('[STATEMENT_PIPELINE] AI diagnostic complete', {
          diagnosis: aiDiagnosticResult.diagnosis,
          confidenceScore: aiDiagnosticResult.confidenceScore
        });

        // Step 4: AI rescue — candidate overlay pattern
        // NEVER mutate extracted.transactions directly. Build a repaired
        // candidate from parser evidence (dropped rows / uncertain column
        // assignments), reconcile base vs repaired, pick the better checksum.
        rescueOutcome = 'RESCUE_SKIPPED';

        if (extracted.droppedRows?.length || extracted.uncertainAssignments?.length) {
          const evidence = {
            droppedRows: extracted.droppedRows || [],
            uncertainAssignments: extracted.uncertainAssignments || [],
            transactions: extracted.transactions || [],
            fullText: ctx.text || ctx.altText || '',
          };

          // Per-section deltas: parsed totals split by sectionId, compared
          // against printed totals. Gives the model the section-level picture
          // (which section is over/under) instead of only the aggregate gap.
          const sectionTotals = {};
          for (const t of extracted.transactions || []) {
            const sid = t.sectionId || t.section || 'unknown';
            sectionTotals[sid] ??= { count: 0, credits: 0, debits: 0 };
            const amt = Number(t.amount) || 0;
            sectionTotals[sid].count += 1;
            if (amt >= 0) sectionTotals[sid].credits += amt;
            else sectionTotals[sid].debits += -amt;
          }
          const sectionDeltas = Object.entries(sectionTotals).map(([section, s]) => ({
            section,
            count: s.count,
            credits: Math.round(s.credits * 100) / 100,
            debits: Math.round(s.debits * 100) / 100,
            net: Math.round((s.credits - s.debits) * 100) / 100,
          })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

          const withBalance = (extracted.transactions || []).filter(
            (t) => t.balance != null
          ).length;
          const balanceCoverage = extracted.transactions?.length
            ? (withBalance / extracted.transactions.length) * 100
            : 0;

          const { modeCounts, batches } = classifyRescueItems(evidence);
          logger.info('[STATEMENT_PIPELINE] AI rescue items classified', modeCounts);

          if (Object.values(modeCounts).some((c) => c > 0)) {
            try {
              // Check cache first (skips the AI call on repeat runs)
              const docHash = ctx.pdfBuffer
                ? crypto.createHash('sha256').update(ctx.pdfBuffer).digest('hex')
                : 'no-buffer';
              const cacheKey = buildRescueCacheKey(docHash, batches, evidence, {
                promptVersion: RESCUE_PROMPT_VERSION,
              });
              let cached = await getCachedRescue(cacheKey);
              let repairs, stats;
              if (cached?.repairs) {
                ({ repairs, stats } = cached);
                logger.info('[STATEMENT_PIPELINE] AI rescue cache hit');
              } else {
                ({ repairs, stats } = await dispatchRescueBatches(
                  batches,
                  { runRescue: (prompt) => aiOrchestrator.runRescue(prompt) },
                  {
                    existingTxns: extracted.transactions || [],
                    statementVitals: {
                      printedDeposits: reconciliation?.printedDeposits ?? extracted.meta?.printedDeposits ?? null,
                      printedWithdrawals: reconciliation?.printedWithdrawals ?? extracted.meta?.printedWithdrawals ?? null,
                      parsedDeposits: reconciliation?.parsedDeposits ?? null,
                      parsedWithdrawals: reconciliation?.parsedWithdrawals ?? null,
                      sectionDeltas,
                      balanceCoverage: Math.round(balanceCoverage * 10) / 10,
                      txnCount: extracted.transactions?.length ?? 0,
                    },
                  }
                ));
                await setCachedRescue(cacheKey, { repairs, stats });
              }

              logger.info('[STATEMENT_PIPELINE] AI rescue complete', stats);

              if (repairs?.length) {
                // Build repaired candidate (clone base, overlay repairs)
                const baseCandidate = {
                  transactions: [...extracted.transactions],
                  normalizedTransactions: [...(extracted.normalizedTransactions || extracted.transactions)],
                  meta: { ...extracted.meta },
                };
                const repairedCandidate = applyRepairs(baseCandidate, repairs);

                // Reconcile both candidates
                const baseRecon = reconcileRawBundle(
                  {
                    transactions: baseCandidate.transactions,
                    normalizedTransactions: baseCandidate.normalizedTransactions,
                    meta: baseCandidate.meta,
                    printedVitals: {
                      opening: extracted.meta?.openingBalance,
                      closing: extracted.meta?.closingBalance,
                      deposits: reconciliation.printedDeposits,
                      withdrawals: reconciliation.printedWithdrawals,
                    },
                    extractionMode: 'rescue_base',
                  },
                  { profileId: profile.id }
                );
                const repairedRecon = reconcileRawBundle(
                  {
                    transactions: repairedCandidate.transactions,
                    normalizedTransactions: repairedCandidate.normalizedTransactions,
                    meta: repairedCandidate.meta,
                    printedVitals: {
                      opening: extracted.meta?.openingBalance,
                      closing: extracted.meta?.closingBalance,
                      deposits: reconciliation.printedDeposits,
                      withdrawals: reconciliation.printedWithdrawals,
                    },
                    extractionMode: 'rescue_repaired',
                  },
                  { profileId: profile.id }
                );

                const baseDelta = Math.abs(
                  (baseRecon.reconciliationBreakdown?.computedClosing ?? 0) -
                  (baseRecon.reconciliationBreakdown?.closing ?? 0)
                );
                const repairedDelta = Math.abs(
                  (repairedRecon.reconciliationBreakdown?.computedClosing ?? 0) -
                  (repairedRecon.reconciliationBreakdown?.closing ?? 0)
                );

                // Audit trail: both candidates with their reconciliation
                // deltas. The selector downstream (dual engine) scores the
                // repaired candidate as a first-class contender.
                // Pick the winner by checksum delta
                let winnerLabel = 'RESCUE_REJECTED';
                if (repairedDelta < baseDelta) {
                  logger.info('[STATEMENT_PIPELINE] AI rescue IMPROVED checksum', {
                    baseDelta, repairedDelta, improvement: baseDelta - repairedDelta
                  });
                  extracted = repairedCandidate;
                  reconciliation = repairedRecon.reconciliationBreakdown;
                  aiRetryApplied = true;
                  winnerLabel = stats.repairsAccepted === stats.repairsAttempted
                    ? 'RESCUE_APPLIED' : 'RESCUE_PARTIAL';
                  rescueOutcome = winnerLabel;
                } else {
                  logger.info('[STATEMENT_PIPELINE] AI rescue did not improve checksum — keeping base', {
                    baseDelta, repairedDelta
                  });
                  rescueOutcome = 'RESCUE_REJECTED';
                }

                // Both candidates get outcome labels reflecting the final
                // decision: the winner carries the applied outcome, the loser
                // is labeled rejected so downstream selectors never mistake a
                // rejected repair for an applied one.
                rescueCandidates = [
                  {
                    id: 'plumber_repaired',
                    source: 'plumber_repaired',
                    transactions: repairedCandidate.transactions,
                    delta: repairedDelta,
                    checksumOk: Boolean(repairedRecon.reconciliationBreakdown?.checksumOk),
                    rescueOutcome: aiRetryApplied ? winnerLabel : 'RESCUE_REJECTED',
                  },
                  {
                    id: 'plumber_base',
                    source: 'plumber_base',
                    transactions: baseCandidate.transactions,
                    delta: baseDelta,
                    checksumOk: Boolean(baseRecon.reconciliationBreakdown?.checksumOk),
                    rescueOutcome: 'RESCUE_REJECTED',
                  },
                ];
              } else {
                rescueOutcome = stats.repairsAttempted > 0 ? 'RESCUE_REJECTED' : 'RESCUE_SKIPPED';
              }
            } catch (err) {
              logger.warn('[STATEMENT_PIPELINE] AI rescue error', { error: err.message });
              rescueOutcome = 'RESCUE_ERROR';
            }
          }
        }

        // Step 4b: COLUMN_FLIP sign inversion
        // When AI says COLUMN_FLIP with high confidence but tolerance sweep
        // didn't fix it, try inverting ALL transaction signs (not just
        // section-verified ones — more aggressive than checksumFailureMatrix).
        if (!aiRetryApplied && aiDiagnosticResult?.diagnosis === 'COLUMN_FLIP' &&
            aiDiagnosticResult.confidenceScore >= 0.7 && ctx.pdfBuffer) {
          try {
            logger.info('[STATEMENT_PIPELINE] AI COLUMN_FLIP — inverting all signs');
            const invertedTxs = extracted.transactions.map(t => ({
              ...t,
              amount: -(t.amount ?? 0),
              type: (t.type === 'CREDIT' || t.type === 'credit') ? 'DEBIT' :
                    (t.type === 'DEBIT' || t.type === 'debit') ? 'CREDIT' : t.type,
            }));
            const flipRecon = reconcileRawBundle(
              {
                transactions: invertedTxs,
                normalizedTransactions: invertedTxs,
                meta: extracted.meta,
                printedVitals: {
                  opening: extracted.meta?.openingBalance,
                  closing: extracted.meta?.closingBalance,
                  deposits: reconciliation.printedDeposits,
                  withdrawals: reconciliation.printedWithdrawals,
                },
                extractionMode: 'ai_colum_flip_invert',
              },
              { profileId: profile.id }
            );
            if (flipRecon.reconciliationBreakdown?.checksumOk) {
              logger.info('[STATEMENT_PIPELINE] AI COLUMN_FLIP inversion SUCCESS — checksum passed!');
              extracted.transactions = invertedTxs;
              extracted.normalizedTransactions = invertedTxs;
              reconciliation = flipRecon.reconciliationBreakdown;
              aiRetryApplied = true;
            } else {
              logger.info('[STATEMENT_PIPELINE] AI COLUMN_FLIP inversion — checksum still failed', {
                delta: flipRecon.reconciliationBreakdown?.computedClosing != null && flipRecon.reconciliationBreakdown?.closing != null
                  ? Number((flipRecon.reconciliationBreakdown.computedClosing - flipRecon.reconciliationBreakdown.closing).toFixed(2))
                  : null,
              });
            }
          } catch (flipErr) {
            logger.warn('[STATEMENT_PIPELINE] AI COLUMN_FLIP inversion failed', { error: flipErr.message });
          }
        }
      } catch (e) {
        logger.warn('[STATEMENT_PIPELINE] AI diagnostic failed', { error: e.message });
      }
    } else {
      logger.info('[STATEMENT_PIPELINE] AI diagnostic skipped — no API key configured');
    }
  }
  // ── end section + AI diagnostic ─────────────────────────────────────────────

  // ── RAW_LEDGER rescue: zero-ledger fallback tier ──────────────────────────
  // Every deterministic engine returned zero transactions. If the sidecar
  // captured raw word rows (unknown layout), attempt ONE bounded AI
  // reconstruction of the ledger from raw words. Repairs go through the same
  // acceptance gates (bbox grounding, date, amount, description quality).
  // Fires only when there is no surgical ammunition (no dropped rows, no
  // uncertain assignments) so an unknown layout costs at most one AI call.
  let rawLedgerOutcome = 'RESCUE_SKIPPED';
  let rawLedgerApplied = false;
  const rawLedgerRows = extracted.rawWordRows || ctx.plumberRawWordRows || [];

  if (
    !extracted.transactions?.length &&
    !extracted.droppedRows?.length &&
    !extracted.uncertainAssignments?.length &&
    rawLedgerRows.length &&
    resolveGeminiApiKey()
  ) {
    try {
      const evidence = {
        droppedRows: [],
        uncertainAssignments: [],
        transactions: [],
        rawWordRows: rawLedgerRows,
        fullText: ctx.text || ctx.altText || '',
      };
      const { modeCounts, batches } = classifyRescueItems(evidence);
      if ((modeCounts[RESCUE_MODES.RAW_LEDGER] ?? 0) > 0) {
        const docHash = ctx.pdfBuffer
          ? crypto.createHash('sha256').update(ctx.pdfBuffer).digest('hex')
          : 'no-buffer';
        const cacheKey = buildRescueCacheKey(docHash, batches, evidence, {
          promptVersion: RESCUE_PROMPT_VERSION,
        });
        let cached = await getCachedRescue(cacheKey);
        let repairs, stats;
        if (cached?.repairs) {
          ({ repairs, stats } = cached);
          logger.info('[STATEMENT_PIPELINE] RAW_LEDGER cache hit');
        } else {
          ({ repairs, stats } = await dispatchRescueBatches(
            batches,
            { runRescue: (prompt) => aiOrchestrator.runRescue(prompt) },
            {
              existingTxns: [],
              statementVitals: {
                printedDeposits: extracted.meta?.printedDeposits ?? null,
                printedWithdrawals: extracted.meta?.printedWithdrawals ?? null,
                parsedDeposits: 0,
                parsedWithdrawals: 0,
                sectionDeltas: [],
                balanceCoverage: 0,
                txnCount: 0,
              },
            }
          ));
          await setCachedRescue(cacheKey, { repairs, stats });
        }

        if (repairs?.length) {
          const baseCandidate = {
            transactions: [],
            normalizedTransactions: [],
            meta: { ...extracted.meta },
          };
          const repairedCandidate = applyRepairs(baseCandidate, repairs);
          const repairedRecon = reconcileRawBundle(
            {
              transactions: repairedCandidate.transactions,
              normalizedTransactions: repairedCandidate.normalizedTransactions,
              meta: repairedCandidate.meta,
              printedVitals: {
                opening: extracted.meta?.openingBalance,
                closing: extracted.meta?.closingBalance,
                deposits: extracted.meta?.printedDeposits,
                withdrawals: extracted.meta?.printedWithdrawals,
              },
              extractionMode: 'raw_ledger_repaired',
            },
            { profileId: profile.id }
          );
          const recon = repairedRecon.reconciliationBreakdown;

          // Acceptance: rows survived the gates + model confidence already.
          // Math corroborates when vitals exist; when no printed totals exist
          // (true unknown layout), the per-repair gates are the authority —
          // there is no arithmetic left to contradict the reconstruction.
          const ledgerBuilt = repairedCandidate.transactions.length > 0;
          const baselineDelta =
            extracted.meta?.openingBalance != null && extracted.meta?.closingBalance != null
              ? Math.abs(extracted.meta.openingBalance - extracted.meta.closingBalance)
              : null;
          const repairedDelta =
            recon?.computedClosing != null && recon?.closing != null
              ? Math.abs(recon.computedClosing - recon.closing)
              : null;
          const hasMathVitals =
            extracted.meta?.openingBalance != null ||
            extracted.meta?.closingBalance != null ||
            extracted.meta?.printedDeposits != null ||
            extracted.meta?.printedWithdrawals != null;
          const checksumImproved =
            recon?.checksumOk ||
            (baselineDelta != null &&
              repairedDelta != null &&
              repairedDelta < baselineDelta);
          const gateQualityAccepts = !hasMathVitals && ledgerBuilt;

          if (ledgerBuilt && (checksumImproved || gateQualityAccepts)) {
            extracted = {
              ...extracted,
              transactions: repairedCandidate.transactions,
              normalizedTransactions: repairedCandidate.normalizedTransactions,
            };
            reconciliation = recon;
            rawLedgerApplied = true;
            rawLedgerOutcome =
              stats.repairsAccepted === stats.repairsAttempted
                ? 'RESCUE_APPLIED'
                : 'RESCUE_PARTIAL';
            logger.info('[STATEMENT_PIPELINE] RAW_LEDGER built ledger', {
              txnCount: repairedCandidate.transactions.length,
              repairsAccepted: stats.repairsAccepted,
              repairsAttempted: stats.repairsAttempted,
              checksumOk: Boolean(recon?.checksumOk),
            });
          } else {
            rawLedgerOutcome = 'RESCUE_REJECTED';
            logger.warn('[STATEMENT_PIPELINE] RAW_LEDGER did not improve ledger', {
              ledgerBuilt,
              checksumImproved,
              gateQualityAccepts,
              hasMathVitals,
              baselineDelta,
              repairedDelta,
              reconChecksumOk: Boolean(recon?.checksumOk),
              reconClosing: recon?.closing ?? null,
              reconComputed: recon?.computedClosing ?? null,
              metaOpening: extracted.meta?.openingBalance ?? null,
              metaClosing: extracted.meta?.closingBalance ?? null,
              metaPrintedDep: extracted.meta?.printedDeposits ?? null,
              metaPrintedWd: extracted.meta?.printedWithdrawals ?? null,
              repairsAccepted: stats.repairsAccepted,
            });
          }
        } else {
          rawLedgerOutcome =
            stats.repairsAttempted > 0 ? 'RESCUE_REJECTED' : 'RESCUE_SKIPPED';
        }
      }
    } catch (err) {
      logger.warn('[STATEMENT_PIPELINE] RAW_LEDGER error', { error: err.message });
      rawLedgerOutcome = 'RESCUE_ERROR';
    }
  }
  // ── end RAW_LEDGER ──────────────────────────────────────────────────────────

  // Store rescue outcome in meta for downstream consumers
  extracted.meta = { ...(extracted.meta || {}), rescueOutcome, rawLedgerApplied, rawLedgerOutcome };

  logger.info('[STATEMENT_PIPELINE] complete', {
    profileId: profile.id,
    txnCount: extracted.transactions?.length ?? 0,
    checksumOk: reconciliation.checksumOk,
    depositsMatch: reconciliation.depositsMatch,
    withdrawalsMatch: reconciliation.withdrawalsMatch,
    dailyBalanceValid: dailyBalanceRule.valid,
    extractionTier,
    ocrRescueApplied,
    ocrRescueFailed,
    columnFlipRepaired,
    aiRetryApplied,
    rescueOutcome,
    rawLedgerApplied,
    rawLedgerOutcome,
    sectionFailingSection: sectionDiagnostic?.failingSection,
    sectionConfidence: sectionDiagnostic?.confidence,
    sectionRecommendedAction: sectionDiagnostic?.recommendedAction,
    aiDiagnosis: aiDiagnosticResult?.diagnosis,
    durationMs: Date.now() - started
  });

  return {
    meta: {
      ...meta,
      ocrRescueApplied,
      ocrRescueFailed,
      columnFlipRepaired,
      aiRetryApplied,
      rescueOutcome,
      rawLedgerApplied,
      rawLedgerOutcome,
      sectionDiagnostic,
      aiDiagnosticResult
    },
    transactions: extracted.transactions,
    normalizedTransactions: extracted.normalizedTransactions,
    stitcherPrinted: extracted.stitcherPrinted,
    stitcher: extracted.stitcher,
    reconciliation,
    rescueCandidates,
    dailyBalanceRule,
    extractionTier,
    profileId: profile.id,
    droppedRows: extracted.droppedRows || [],
    uncertainAssignments: extracted.uncertainAssignments || [],
    rawWordRows: extracted.rawWordRows || [],
    chasePlumberTransactions: extracted.chasePlumberTransactions ?? null
  };
}

export default { runStatementExtractionPipeline };
