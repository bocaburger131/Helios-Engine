import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function findImports(dir) {
  const imports = new Set();
  
  async function scanFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Find import statements
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Only track npm packages (not relative imports)
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          // Extract package name (handle scoped packages)
          const packageName = importPath.startsWith('@') 
            ? importPath.split('/').slice(0, 2).join('/')
            : importPath.split('/')[0];
          imports.add(packageName);
        }
      }
      
      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          const packageName = importPath.startsWith('@') 
            ? importPath.split('/').slice(0, 2).join('/')
            : importPath.split('/')[0];
          imports.add(packageName);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        await scanFile(fullPath);
      }
    }
  }
  
  await walk(dir);
  return Array.from(imports).sort();
}

async function checkMissingPackages() {
  console.log('🔍 Scanning for package imports...\n');
  
  // Get all imports from src directory
  const imports = await findImports(path.join(rootDir, 'src'));
  
  // Read package.json
  const packageJson = JSON.parse(
    await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8')
  );
  
  const installed = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);
  
  // Filter out Node.js built-in modules
  const builtinModules = ['path', 'fs', 'crypto', 'stream', 'util', 'os', 'events', 'http', 'https', 'url', 'querystring', 'child_process', 'cluster', 'buffer'];
  
  // Check which packages are missing
  const missing = imports.filter(pkg => 
    !installed.has(pkg) && 
    !pkg.startsWith('node:') &&
    !builtinModules.includes(pkg)
  );
  
  const found = imports.filter(pkg => installed.has(pkg));
  
  console.log(`📦 Found ${imports.length} package imports\n`);
  
  if (missing.length > 0) {
    console.log('❌ Missing packages:');
    missing.forEach(pkg => console.log(`   - ${pkg}`));
    console.log('\n📝 Install missing packages with:');
    console.log(`   npm install ${missing.join(' ')}`);
  } else {
    console.log('✅ All imported packages are installed!');
  }
  
  console.log('\n✅ Installed packages used:');
  found.forEach(pkg => console.log(`   - ${pkg}`));
}

checkMissingPackages().catch(console.error);