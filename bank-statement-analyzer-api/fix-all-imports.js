import { promises as fs } from 'fs';
import path from 'path';

console.log(' Comprehensive import fix...\n');

async function fixFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;
    
    // Fix various import patterns
    const replacements = [
      [/from ['"](.*)\/transaction\.model\.js['"]/g, "from '$1/Transaction.js'"],
      [/from ['"](.*)\/statement\.model\.js['"]/g, "from '$1/Statement.js'"],
      [/from ['"](.*)\/user\.model\.js['"]/g, "from '$1/User.js'"],
      [/from ['"](.*)\/User\.model\.js['"]/g, "from '$1/User.js'"],
      [/from ['"](.*)\/Statement\.model\.js['"]/g, "from '$1/Statement.js'"],
      [/from ['"](.*)\/Transaction\.model\.js['"]/g, "from '$1/Transaction.js'"],
      // Also fix require statements if any
      [/require\(['"](.*)\/transaction\.model\.js['"]\)/g, "require('$1/Transaction.js')"],
      [/require\(['"](.*)\/statement\.model\.js['"]\)/g, "require('$1/Statement.js')"],
      [/require\(['"](.*)\/user\.model\.js['"]\)/g, "require('$1/User.js')"]
    ];
    
    for (const [pattern, replacement] of replacements) {
      if (content.match(pattern)) {
        content = content.replace(pattern, replacement);
        modified = true;
      }
    }
    
    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(` Fixed: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function scanDirectory(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  let fixedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.includes('node_modules') && !file.name.includes('models_backup')) {
      fixedCount += await scanDirectory(fullPath);
    } else if (file.name.endsWith('.js')) {
      if (await fixFile(fullPath)) {
        fixedCount++;
      }
    }
  }
  
  return fixedCount;
}

const totalFixed = await scanDirectory('./src');
console.log(`\n Fixed ${totalFixed} files`);
