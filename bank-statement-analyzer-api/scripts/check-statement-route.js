import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function checkStatementRoute() {
  console.log('🔍 Checking statement route configuration...\n');
  
  // Check if statement route file exists
  const routeFiles = [
    'src/routes/statementRoutes.js',
    'src/routes/statement.routes.js',
    'src/routes/statements.js'
  ];
  
  for (const file of routeFiles) {
    const filePath = path.join(rootDir, file);
    try {
      await fs.access(filePath);
      console.log(`✅ Found: ${file}`);
      
      // Check the content
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.includes('export default')) {
        console.log('   Has default export ✓');
      }
      if (content.includes('router.get')) {
        console.log('   Has GET routes ✓');
      }
    } catch {
      console.log(`❌ Not found: ${file}`);
    }
  }
  
  // Check app.js route registration
  console.log('\n📄 Checking app.js route registration...');
  const appPath = path.join(rootDir, 'src/app.js');
  try {
    const appContent = await fs.readFile(appPath, 'utf-8');
    const routeRegistrations = appContent.match(/path:\s*['"]\/api\/statements?['"]/g);
    
    if (routeRegistrations) {
      console.log('✅ Statement route is registered in app.js');
      routeRegistrations.forEach(reg => console.log(`   ${reg}`));
    } else {
      console.log('❌ Statement route NOT registered in app.js');
    }
  } catch (error) {
    console.log('❌ Could not read app.js');
  }
}

checkStatementRoute();