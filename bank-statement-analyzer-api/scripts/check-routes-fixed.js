import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const routeTemplates = {
  'authRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Auth routes
router.post('/login', async (req, res) => {
  res.json({ message: 'Login endpoint' });
});

router.post('/register', async (req, res) => {
  res.json({ message: 'Register endpoint' });
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
`,

  'analysisRoutes.js': `import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Analysis routes
router.post('/analyze', authMiddleware, upload.single('file'), async (req, res) => {
  res.json({ message: 'Analysis endpoint' });
});

router.get('/results/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Get analysis results' });
});

export default router;
`,

  'statementRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Statement routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: 'List statements' });
});

router.get('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Get statement by ID' });
});

router.post('/', authMiddleware, async (req, res) => {
  res.json({ message: 'Create statement' });
});

router.delete('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Delete statement' });
});

export default router;
`,

  'merchantRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Merchant routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: 'List merchants' });
});

router.get('/categories', authMiddleware, async (req, res) => {
  res.json({ message: 'Get merchant categories' });
});

router.put('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Update merchant' });
});

export default router;
`,

  'transactionRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Transaction routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: 'List transactions' });
});

router.get('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Get transaction by ID' });
});

router.put('/:id', authMiddleware, async (req, res) => {
  res.json({ message: 'Update transaction' });
});

router.post('/bulk-update', authMiddleware, async (req, res) => {
  res.json({ message: 'Bulk update transactions' });
});

export default router;
`,

  'settingsRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Settings routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: 'Get settings' });
});

router.put('/', authMiddleware, async (req, res) => {
  res.json({ message: 'Update settings' });
});

router.get('/preferences', authMiddleware, async (req, res) => {
  res.json({ message: 'Get user preferences' });
});

export default router;
`,

  'zohoRoutes.js': `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Zoho routes
router.get('/auth', authMiddleware, async (req, res) => {
  res.json({ message: 'Zoho auth endpoint' });
});

router.post('/callback', async (req, res) => {
  res.json({ message: 'Zoho callback' });
});

router.post('/sync', authMiddleware, async (req, res) => {
  res.json({ message: 'Sync with Zoho' });
});

export default router;
`
};

async function checkAndCreateRoutes() {
  console.log('🔍 Checking and creating route files...\n');
  
  const routesDir = path.join(rootDir, 'src', 'routes');
  await ensureDir(routesDir);
  
  for (const [filename, content] of Object.entries(routeTemplates)) {
    const filePath = path.join(routesDir, filename);
    
    if (await fileExists(filePath)) {
      console.log(`✅ ${filename} already exists`);
    } else {
      await fs.writeFile(filePath, content);
      console.log(`✨ Created ${filename}`);
    }
  }
  
  console.log('\n✅ All route files are now present!');
}

checkAndCreateRoutes().catch(console.error);