/**
 * Quick demo server — bypasses problematic imports (mongoose-paginate, redis stream, etc.)
 * Run: node src/demo-server.js
 * Upload: POST http://localhost:3000/api/statements with a PDF file
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Only ${allowed.join(', ')} files allowed`));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ── Auth (demo login — no MongoDB needed) ──
const JWT_SECRET = process.env.JWT_SECRET || 'hermes...2024';

app.post('/api/auth/login', express.json(), (req, res) => {
  const { email, password } = req.body || {};
  // Accept any login in demo mode
  const token = jwt.sign(
    { id: 'demo-user-id', email: email || 'demo@demo.com', role: 'ADMIN', name: (email || 'demo').split('@')[0] },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    success: true,
    token,
    data: { token, user: { id: 'demo-user-id', email: email || 'demo@demo.com', role: 'ADMIN', name: 'Demo User' } }
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Token required' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, data: { user } });
  } catch (e) {
    res.status(403).json({ success: false, error: 'Invalid token' });
  }
});

// ── Health ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mode: 'demo',
    upload: 'POST /api/statements (multipart/form-data)',
    public_upload: 'POST /api/upload (multipart/form-data)',
    health: 'GET /health',
    note: 'Full AI analysis requires MongoDB + Redis — this demo receives files and logs parse info'
  });
});

// ── Upload endpoint ──
app.post('/api/statements', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Use multipart/form-data with field name "file"' });

    const filePath = req.file.path;
    const fileSize = req.file.size;
    const fileName = req.file.originalname;
    const fileExt = path.extname(fileName).toLowerCase();

    console.log(`[DEMO] Received file: ${fileName} (${(fileSize/1024).toFixed(1)} KB)`);

    // Try to parse PDF info using pdf-parse (if installed)
    let pdfInfo = null;
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      pdfInfo = {
        pages: data.numpages,
        textLength: data.text?.length || 0,
        hasText: (data.text?.length || 0) > 100,
        textPreview: data.text?.substring(0, 500) || '(no text extracted)'
      };
      console.log(`[DEMO] PDF parsed: ${pdfInfo.pages} pages, ${pdfInfo.textLength} chars`);
    } catch (pdfErr) {
      console.log(`[DEMO] PDF parse skipped: ${pdfErr.message}`);
      pdfInfo = { note: 'pdf-parse not available — install with: npm install pdf-parse' };
    }

    res.json({
      success: true,
      message: `File "${fileName}" received (${(fileSize/1024).toFixed(1)} KB)`,
      file: {
        name: fileName,
        size: fileSize,
        type: req.file.mimetype,
        path: filePath
      },
      pdfInfo,
      demoMode: true,
      note: 'Full AI analysis requires MongoDB + worker services'
    });
  } catch (err) {
    console.error('[DEMO] Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Public upload (no auth) ──
app.post('/api/upload', upload.single('file'), async (req, res) => {
  // Same as /api/statements but public
  req.app._router.handle(req, res, () => {
    res.redirect(307, '/api/statements');
  });
});

// ── Home page — serve login page ──
app.get('/', (req, res) => {
  const loginPage = path.join(__dirname, '..', 'public', 'login.html');
  if (fs.existsSync(loginPage)) {
    res.sendFile(loginPage);
  } else {
    res.send('Helios Engine Demo — POST /api/statements to upload files');
  }
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Helios Engine Demo running on http://0.0.0.0:${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Upload:  http://localhost:${PORT}/api/statements (POST)`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
});
