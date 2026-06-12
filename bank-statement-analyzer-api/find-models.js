import { promises as fs } from 'fs';
import path from 'path';

console.log(' Finding all Mongoose model definitions...\n');

async function findModels(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.includes('node_modules')) {
      await findModels(fullPath);
    } else if (file.name.endsWith('.js')) {
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        const modelMatches = content.match(/mongoose\.model\(['"](\w+)['"]/g);
        
        if (modelMatches) {
          console.log(` ${fullPath}`);
          modelMatches.forEach(match => {
            const modelName = match.match(/mongoose\.model\(['"](\w+)['"]/)[1];
            console.log(`    Model: ${modelName}`);
          });
          console.log('');
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
}

await findModels('./src');
console.log(' Scan complete');
