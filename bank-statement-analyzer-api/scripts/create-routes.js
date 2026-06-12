import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function createRoutes() {
  console.log('🔧 Creating route files...\n');
  
  const routesDir = path.join(rootDir, 'src', 'routes');
  
  // Ensure routes directory exists
  try {
    await fs.mkdir(routesDir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
  
  // Check each route file and create if missing
  const routes = [
    'authRoutes.js',
    'analysisRoutes.js',
    'statementRoutes.js',
    'merchantRoutes.js',
    'transactionRoutes.js',
    'settingsRoutes.js',
    'zohoRoutes.js'
  ];
  
  for (const route of routes) {
    const filePath = path.join(routesDir, route);
    
    try {
      await fs.access(filePath);
      console.log(`✅ ${route} already exists`);
    } catch {
      // Create a basic route file
      const routeName = route.replace('Routes.js', '');
      const content = `import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// ${routeName} routes
router.get('/', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} endpoint', data: [] });
});

router.get('/:id', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} detail', id: req.params.id });
});

router.post('/', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} created', data: req.body });
});

router.put('/:id', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} updated', id: req.params.id });
});

router.delete('/:id', authMiddleware, async (req, res) => {
  res.json({ message: '${routeName} deleted', id: req.params.id });
});

export default router;
`;
      
      await fs.writeFile(filePath, content);
      console.log(`✨ Created ${route}`);
    }
  }
  
  console.log('\n✅ All route files created!');
}

createRoutes().catch(console.error);