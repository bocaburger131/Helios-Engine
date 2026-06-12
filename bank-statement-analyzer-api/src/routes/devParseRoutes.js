/**
 * Dev-only parse & statement endpoints for Helios dashboard testing.
 * Gated to development / TEST_MODE.
 */
import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import pdfParserService from '../services/pdfParserService.js';
import statementController from '../controllers/statementController.js';
import logger from '../utils/logger.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const parserService = pdfParserService;

function devRoutesEnabled() {
  return process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
}

function devGate(req, res, next) {
  if (!devRoutesEnabled()) {
    return res.status(404).json({ success: false, error: 'Dev routes are disabled' });
  }
  req.user = { id: 'helios-dev-dashboard', role: 'ADMIN' };
  next();
}

router.use(devGate);

/**
 * POST /api/dev/parse-statement
 * multipart field: statement (PDF)
 * query: shadow=1|0, primary=1|0, vera=1|0
 */
router.post('/parse-statement', upload.single('statement'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, error: 'PDF file required (field: statement)' });
    }

    const shadow = req.query.shadow !== '0';
    const primary = req.query.primary === '1';
    const vera = req.query.vera !== '0';

    const parseResult = await parserService.parseStatement(req.file.buffer, {
      fileName: req.file.originalname,
      forceLayoutFirstShadow: shadow,
      forceLayoutFirstPrimary: primary,
      enableVeraFallback: vera
    });

    const meta = parseResult.metadata ?? {};
    const recon = meta.profileReconciliation ?? meta.wellsReconciliation ?? null;
    const txns = parseResult.transactions ?? [];

    res.json({
      success: true,
      data: {
        fileName: req.file.originalname,
        bankName: parseResult.bankName,
        accountNumber: parseResult.accountNumber,
        profileId: meta.extractionProfile,
        profileConfidence: meta.profileConfidence,
        extractionTier: meta.extractionTier,
        txnCount: txns.length,
        balances: {
          opening: parseResult.openingBalance ?? parseResult.balances?.opening,
          closing: parseResult.closingBalance ?? parseResult.balances?.closing
        },
        reconciliation: recon
          ? {
              checksumOk: recon.checksumOk,
              parsedDeposits: recon.parsedDeposits,
              parsedWithdrawals: recon.parsedWithdrawals,
              printedDeposits: recon.printedDeposits,
              printedWithdrawals: recon.printedWithdrawals,
              computedClosing: recon.computedClosing,
              closing: recon.closing,
              depositsMatch: recon.depositsMatch,
              withdrawalsMatch: recon.withdrawalsMatch,
              closingMatch: recon.closingMatch
            }
          : null,
        layoutPipelineShadow: meta.layoutPipelineShadow ?? null,
        stitcherPrinted: meta.stitcher?.printedSummary ?? null,
        transactionsSample: txns.slice(0, 25).map((t) => ({
          date: t.date,
          description: String(t.description ?? '').slice(0, 120),
          amount: t.amount,
          type: t.type
        }))
      }
    });
  } catch (err) {
    logger.warn('[DEV_PARSE] parse-statement failed', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message || 'Parse failed'
    });
  }
});

/**
 * POST /api/dev/parse-statement/path
 * body: { path: "relative/or/absolute.pdf" } — local fixture path on API host
 */
router.post('/parse-statement/path', express.json(), async (req, res) => {
  try {
    const filePath = req.body?.path;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'body.path required' });
    }

    const buffer = await fs.readFile(filePath);
    const shadow = req.query.shadow !== '0';
    const primary = req.query.primary === '1';

    const parseResult = await parserService.parseStatement(buffer, {
      fileName: filePath.split(/[/\\]/).pop(),
      forceLayoutFirstShadow: shadow,
      forceLayoutFirstPrimary: primary
    });

    const meta = parseResult.metadata ?? {};
    res.json({
      success: true,
      data: {
        fileName: filePath.split(/[/\\]/).pop(),
        profileId: meta.extractionProfile,
        txnCount: parseResult.transactions?.length ?? 0,
        reconciliation: meta.profileReconciliation,
        layoutPipelineShadow: meta.layoutPipelineShadow ?? null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/statements', (req, res, next) => statementController.getStatements(req, res, next));
router.get('/statements/:id', (req, res, next) => statementController.getStatementById(req, res, next));

router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      layoutFirstShadow: process.env.LAYOUT_FIRST_SHADOW === 'true',
      layoutFirstPrimary: process.env.LAYOUT_FIRST_PRIMARY === 'true',
      testMode: devRoutesEnabled(),
      apiPort: process.env.PORT || 3000
    }
  });
});

export default router;
