import { promises as fs } from 'fs';
import path from 'path';

console.log(' Fixing model imports...\n');

// Map old imports to new imports
const importMap = {
  'transaction.model.js': 'Transaction.js',
  'statement.model.js': 'Statement.js',
  'user.model.js': 'User.js',
  'User.model.js': 'User.js',
  'Statement.model.js': 'Statement.js',
  'Transaction.model.js': 'Transaction.js'
};

async function fixImports(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.includes('node_modules') && !file.name.includes('models_backup')) {
      await fixImports(fullPath);
    } else if (file.name.endsWith('.js') && !file.name.includes('.test.')) {
      try {
        let content = await fs.readFile(fullPath, 'utf8');
        let modified = false;
        
        // Check for imports that need fixing
        for (const [oldFile, newFile] of Object.entries(importMap)) {
          const regex = new RegExp(`from ['"](.*/models/)${oldFile}['"]`, 'g');
          if (content.match(regex)) {
            content = content.replace(regex, `from '$1${newFile}'`);
            modified = true;
            console.log(` Fixed import in: ${fullPath}`);
            console.log(`   ${oldFile}  ${newFile}`);
          }
        }
        
        if (modified) {
          await fs.writeFile(fullPath, content, 'utf8');
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
}

await fixImports('./src');
console.log('\n Import fixes complete!');
