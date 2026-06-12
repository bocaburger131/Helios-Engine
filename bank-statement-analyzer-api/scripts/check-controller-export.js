import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function checkControllerExports() {
  const controllers = [
    'src/controllers/statement.controller.js',
    'src/controllers/transaction.controller.js'
  ];

  for (const controller of controllers) {
    const filePath = path.join(rootDir, controller);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`\n📄 ${controller}:`);
      
      // Check for export patterns
      if (content.includes('export default')) {
        console.log('  ✅ Uses default export');
      }
      if (content.match(/export\s+(const|class|function)\s+\w+/)) {
        console.log('  ✅ Uses named exports');
      }
      
      // Show the actual export lines
      const exportLines = content.split('\n').filter(line => 
        line.includes('export') && !line.trim().startsWith('//')
      );
      exportLines.forEach(line => {
        console.log(`  📝 ${line.trim()}`);
      });
    } catch (error) {
      console.log(`  ❌ File not found`);
    }
  }
}

checkControllerExports();