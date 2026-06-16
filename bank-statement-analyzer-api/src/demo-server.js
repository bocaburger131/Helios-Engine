/**
 * Helios Engine Demo Server
 * Standalone server that mocks the full backend API for live demos.
 * No MongoDB, no Redis — just Node.js + Express.
 * 
 * Run: node src/demo-server.js
 * Open: http://localhost:3000
 * Login: any email + any password
 */
process.env.USE_REDIS = 'false';
process.env.DEMO_MODE = 'true';
process.env.ENABLE_PUBLIC_UPLOAD = 'true';
process.env.DISABLE_AUTH = 'true';

import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hermes-demo-2024';

// ── Setup ──
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ── Static files (this is what makes the UI work!) ──
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
  }
}));

// ── Multer ──
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) return cb(null, true);
    cb(new Error(`Only PDF, PNG, JPG files allowed`));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ── In-memory store ──
const statements = {};
let statementCounter = 0;

function demoUser(email) {
  return { id: 'demo-user-id', email, role: 'ADMIN', name: email.split('@')[0] };
}

function signToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

function extractUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.split(' ')[1];
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function requireAuth(req, res, next) {
  if (extractUser(req)) return next();
  res.status(401).json({ success: false, error: 'Authentication required' });
}

function mockId() {
  return 'stmt_' + crypto.randomBytes(8).toString('hex');
}

// ============================================================
//  AUTH
// ============================================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = demoUser(email || 'demo@demo.com');
  const token = signToken(user);
  res.json({ success: true, token, data: { token, user } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ success: true, data: { user: extractUser(req) } });
});

// ============================================================
//  APP MODE
// ============================================================
app.get('/api/app-mode', (req, res) => {
  res.json({
    success: true,
    data: {
      mode: 'DEMO',
      features: {
        crmIntegration: false,
        enhancedAnalysis: true,
        batchUpload: true,
        publicApi: false
      },
      dataSource: 'pdf-upload',
      crmAvailable: false,
      validationIssues: []
    }
  });
});

// ============================================================
//  HEALTH
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mode: 'demo',
    note: 'Helios Engine Demo — no MongoDB/Redis required'
  });
});

// ============================================================
//  STATEMENTS — Upload
// ============================================================
app.post('/api/statements', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const id = mockId();
    const now = new Date().toISOString();
    const fileName = req.file.originalname;
    const filePath = req.file.path;

    // Mock parse result
    let pdfInfo = null;
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      pdfInfo = { pages: data.numpages, textLength: data.text?.length || 0, textPreview: data.text?.substring(0, 500) };
    } catch {
      pdfInfo = { pages: 1, textLength: 0, note: 'pdf-parse not available' };
    }

    const statement = {
      _id: id,
      id,
      fileName,
      originalName: fileName,
      filePath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'uploaded',
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      pages: pdfInfo.pages || 1,
      textLength: pdfInfo.textLength || 0,
      hasText: pdfInfo.textLength > 100,
      user: 'demo-user-id'
    };
    statements[id] = statement;
    statementCounter++;

    res.status(201).json({
      success: true,
      message: `"${fileName}" uploaded successfully`,
      data: { statement }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
//  STATEMENTS — List
// ============================================================
app.get('/api/statements/list', requireAuth, (req, res) => {
  const list = Object.values(statements).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ success: true, data: list, total: list.length });
});

app.get('/api/statements', requireAuth, (req, res) => {
  const list = Object.values(statements).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ success: true, data: list, total: list.length });
});

// ============================================================
//  STATEMENTS — Get by ID
// ============================================================
app.get('/api/statements/:id', requireAuth, (req, res) => {
  const stmt = statements[req.params.id];
  if (!stmt) return res.status(404).json({ success: false, error: 'Statement not found' });
  
  res.json({
    success: true,
    data: {
      statement: stmt,
      vera: {
        pdfUrl: `/api/statements/${req.params.id}/download`
      },
      analysis: {
        status: 'completed',
        summary: {
          totalDeposits: 1250000,
          totalWithdrawals: 980000,
          avgDailyBalance: 42500,
          nsfCount: 3,
          statementPeriod: { start: '2025-01-01', end: '2025-03-31' }
        },
        alerts: [
          { code: 'NSF_001', type: 'risk', severity: 'high', title: 'Insufficient Funds', description: '3 NSF events in period' },
          { code: 'CASH_001', type: 'cash_flow', severity: 'medium', title: 'Cash Flow Volatility', description: 'Revenue fluctuation >30%' },
          { code: 'COMP_001', type: 'compliance', severity: 'low', title: 'Minimum Balance', description: 'Balance below threshold on 2 days' }
        ],
        transactions: [
          { date: '2025-03-15', description: 'ACH Deposit - PAYMENT SOLUTIONS INC', amount: 45000, type: 'credit', category: 'revenue' },
          { date: '2025-03-14', description: 'Wire Transfer - GLOBAL DISTRIBUTORS LLC', amount: 28500, type: 'credit', category: 'revenue' },
          { date: '2025-03-14', description: 'Check #4521 - Office Rent', amount: -8500, type: 'debit', category: 'overhead' },
          { date: '2025-03-13', description: 'ACH Withdrawal - PAYROLL PROCESSING', amount: -22500, type: 'debit', category: 'payroll' },
          { date: '2025-03-12', description: 'NSF Fee - RETURNED CHECK', amount: -35, type: 'debit', category: 'fees' },
          { date: '2025-03-10', description: 'Credit Card Payment - AMEX CORP', amount: -4200, type: 'debit', category: 'overhead' },
          { date: '2025-03-08', description: 'Deposit - MERCHANT SETTLEMENT', amount: 18750, type: 'credit', category: 'revenue' }
        ]
      }
    }
  });
});

// ============================================================
//  STATEMENTS — Download
// ============================================================
app.get('/api/statements/:id/download', requireAuth, (req, res) => {
  const stmt = statements[req.params.id];
  if (!stmt || !fs.existsSync(stmt.filePath)) return res.status(404).json({ success: false, error: 'File not found' });
  res.download(stmt.filePath, stmt.originalName || 'statement.pdf');
});

// ============================================================
//  BATCH TRIAGE
// ============================================================
app.post('/api/statements/batch/triage', requireAuth, upload.array('files', 10), (req, res) => {
  const files = req.files || [];
  if (!files.length && !req.body?.fileNames) {
    return res.status(400).json({ success: false, error: 'No files provided' });
  }

  const sessionId = 'triage_' + crypto.randomBytes(8).toString('hex');
  const triageFiles = files.map(f => ({
    fileName: f.originalname,
    size: f.size,
    path: f.path,
    status: 'pending'
  }));

  // Store triage session
  statements[sessionId] = { sessionId, files: triageFiles, createdAt: new Date().toISOString() };

  res.json({
    success: true,
    data: {
      uploadSessionId: sessionId,
      files: triageFiles.map(f => ({
        fileName: f.fileName,
        fileSize: f.size,
        status: 'pending'
      })),
      triage: {
        banks: [
          { name: 'Chase Bank NA', rtn: '021000021', confidence: 0.92 },
          { name: 'Bank of America', rtn: '026009593', confidence: 0.08 }
        ],
        suggestedBank: { name: 'Chase Bank NA', rtn: '021000021', confidence: 0.92 },
        dealContext: {
          dealId: req.body?.dealId || 'APP-DEMO-' + Date.now().toString().slice(-5),
          businessName: req.body?.businessName || 'Demo Business LLC',
          statedRevenue: req.body?.statedRevenue || '$500K–$1M'
        }
      }
    }
  });
});

// ============================================================
//  BATCH — Confirm Bank
// ============================================================
app.post('/api/statements/batch/confirm-bank', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      confirmed: true,
      bank: req.body?.rtn || '021000021',
      bankName: req.body?.bankName || 'Chase Bank NA'
    }
  });
});

// ============================================================
//  BATCH — Run Analysis
// ============================================================
app.post('/api/statements/batch', requireAuth, (req, res) => {
  const sessionId = req.body?.uploadSessionId || req.body?.sessionId;
  if (!sessionId) return res.status(400).json({ success: false, error: 'uploadSessionId required' });

  const session = statements[sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const jobId = 'job_' + crypto.randomBytes(8).toString('hex');
  const correlationId = 'corr_' + crypto.randomBytes(8).toString('hex');

  // Create statement result
  const stmtId = mockId();
  const now = new Date().toISOString();
  const fileName = session.files?.[0]?.fileName || 'statement.pdf';

  statements[stmtId] = {
    _id: stmtId, id: stmtId, jobId, correlationId,
    fileName, originalName: fileName,
    filePath: session.files?.[0]?.path || path.join(UPLOAD_DIR, fileName),
    status: 'completed',
    uploadedAt: now, createdAt: now, updatedAt: now,
    pages: 3, hasText: true,
    user: 'demo-user-id',
    analysis: {
      status: 'completed',
      summary: {
        totalDeposits: 1250000,
        totalWithdrawals: 980000,
        avgDailyBalance: 42500,
        nsfCount: 3,
        statementPeriod: { start: '2025-01-01', end: '2025-03-31' }
      },
      alerts: [
        { code: 'NSF_001', type: 'risk', severity: 'high', title: '3 NSF Events Detected', description: 'Insufficient funds on Mar 5, Feb 12, Jan 28' },
        { code: 'CASH_001', type: 'cash_flow', severity: 'medium', title: 'Cash Flow Volatility', description: 'Monthly revenue varies 35% between months' },
        { code: 'COMP_001', type: 'compliance', severity: 'low', title: 'Minimum Balance Threshold', description: 'Balance dropped below $5K on 2 days' }
      ]
    }
  };

  // Store job info
  statements[jobId] = { jobId, correlationId, status: 'completed', sessionId, stmtId };

  res.status(201).json({
    success: true,
    data: {
      statementId: stmtId,
      jobId,
      correlationId,
      status: 'completed',
      redirectUrl: `/manual-results.html?id=${stmtId}`
    }
  });
});

// ============================================================
//  BATCH — Progress & Job Status
// ============================================================
app.get('/api/statements/batch/progress/:correlationId', requireAuth, (req, res) => {
  res.json({
    success: true,
    progress: {
      phase: 'completed',
      message: 'Analysis complete',
      progress: 100,
      estimate: 'done'
    }
  });
});

app.get('/api/statements/batch/jobs/:jobId', requireAuth, (req, res) => {
  const job = statements[req.params.jobId];
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      correlationId: job.correlationId,
      statementId: job.stmtId,
      progress: job.status === 'completed' ? 100 : 50
    }
  });
});

// ============================================================
//  TRIAGE — File Preview
// ============================================================
app.get('/api/statements/batch/triage/:sessionId/file/:fileName', requireAuth, (req, res) => {
  const session = statements[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  const file = session.files?.find(f => f.fileName === req.params.fileName);
  if (!file || !fs.existsSync(file.path)) return res.status(404).json({ success: false, error: 'File not found' });
  res.sendFile(file.path);
});

// ============================================================
//  RESULTS / ANALYSIS ENDPOINTS
// ============================================================
app.get('/api/statements/:id/analytics', requireAuth, (req, res) => {
  const stmt = statements[req.params.id];
  if (!stmt) return res.status(404).json({ success: false, error: 'Statement not found' });

  res.json({
    success: true,
    data: {
      statementId: req.params.id,
      fileName: stmt.fileName || 'statement.pdf',
      status: 'completed',
      summary: {
        totalDeposits: 1250000,
        totalWithdrawals: 980000,
        netCashFlow: 270000,
        avgDailyBalance: 42500,
        avgDepositSize: 52000,
        largestDeposit: 150000,
        largestWithdrawal: 85000,
        nsfCount: 3,
        nsfTotal: 105,
        transactionCount: 47,
        statementPeriod: { start: '2025-01-01', end: '2025-03-31' }
      },
      cashFlow: {
        monthly: [
          { month: '2025-01', deposits: 410000, withdrawals: 325000, net: 85000, avgBalance: 38000 },
          { month: '2025-02', deposits: 395000, withdrawals: 340000, net: 55000, avgBalance: 42000 },
          { month: '2025-03', deposits: 445000, withdrawals: 315000, net: 130000, avgBalance: 47500 }
        ],
        volatility: 0.23,
        consistency: 0.78
      },
      alerts: stmt.analysis?.alerts || [],
      risk: {
        overallScore: 72,
        category: 'moderate',
        factors: [
          { name: 'NSF History', score: 65, severity: 'high', detail: '3 events' },
          { name: 'Cash Flow Stability', score: 78, severity: 'medium', detail: '23% monthly variance' },
          { name: 'Balance Adequacy', score: 85, severity: 'low', detail: 'Avg $42.5K' },
          { name: 'Deposit Consistency', score: 82, severity: 'low', detail: 'Regular ACH deposits' }
        ]
      },
      transactions: [
        { date: '2025-03-15', description: 'ACH Deposit - PAYMENT SOLUTIONS', amount: 45000, type: 'credit', balance: 52300 },
        { date: '2025-03-14', description: 'Wire - GLOBAL DISTRIBUTORS LLC', amount: 28500, type: 'credit', balance: 48300 },
        { date: '2025-03-14', description: 'Check #4521 - Office Rent', amount: -8500, type: 'debit', balance: 19800 },
        { date: '2025-03-13', description: 'ACH - PAYROLL PROCESSING', amount: -22500, type: 'debit', balance: 28300 },
        { date: '2025-03-12', description: 'NSF Fee', amount: -35, type: 'debit', balance: 50800 },
        { date: '2025-03-10', description: 'CC Payment - AMEX', amount: -4200, type: 'debit', balance: 50835 },
        { date: '2025-03-08', description: 'Deposit - MERCHANT SETTLEMENT', amount: 18750, type: 'credit', balance: 55035 },
        { date: '2025-03-05', description: 'Deposit - ONLINE PAYMENTS INC', amount: 62300, type: 'credit', balance: 36285 }
      ]
    }
  });
});

app.get('/api/statements/:id/analysis-status', requireAuth, (req, res) => {
  res.json({ success: true, data: { status: 'completed', progress: 100 } });
});

app.get('/api/statements/:id/analysis-history', requireAuth, (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/statements/:id/analyze', requireAuth, (req, res) => {
  res.json({ success: true, message: 'Analysis complete', data: { id: req.params.id, status: 'completed' } });
});

app.post('/api/statements/:id/analyze-enhanced', requireAuth, (req, res) => {
  res.json({ success: true, message: 'Enhanced analysis complete', data: { id: req.params.id, status: 'completed' } });
});

// ============================================================
//  VERITAS / RISK
// ============================================================
app.post('/api/statements/veritas', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      score: 72,
      rating: 'Standard',
      factors: ['Cash Flow: 78', 'NSF: 65', 'Balance: 85', 'Deposits: 82'],
      recommendation: 'Proceed with standard due diligence'
    }
  });
});

app.post('/api/statements/risk', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      overallScore: 72,
      category: 'moderate',
      recommendation: 'Proceed — monitoring recommended'
    }
  });
});

// ============================================================
//  MERCHANTS / SETTINGS (placeholders)
// ============================================================
app.get('/api/merchants', (req, res) => res.json({ success: true, data: [] }));
app.get('/api/settings', (req, res) => res.json({ success: true, data: { theme: 'light', notifications: true } }));
app.get('/api/metrics', (req, res) => res.json({ success: true, data: { uptime: process.uptime(), statements: statementCounter } }));

// ============================================================
//  Root — serve login page
// ============================================================
app.get('/', (req, res) => {
  const loginPage = path.join(PUBLIC_DIR, 'login.html');
  if (fs.existsSync(loginPage)) return res.sendFile(loginPage);
  res.send('<h1>Helios Engine Demo</h1><p>POST /api/statements to upload</p>');
});

// ============================================================
//  Error handler
// ============================================================
app.use((err, req, res, _next) => {
  console.error('[Demo] Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ============================================================
//  Start
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀  Helios Engine Demo Server`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Login:   any email + password works`);
  console.log(`  Health:  http://localhost:${PORT}/health\n`);
});
