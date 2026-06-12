import fs from 'fs';
import path from 'path';

console.log('Fixing auth middleware imports...');

const routesDir = 'src/routes';
const files = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace auth.middleware.js imports with auth.js
  const oldImport = "from '../middleware/auth.middleware.js'";
  const newImport = "from '../middleware/auth.js'";
  
  if (content.includes(oldImport)) {
    console.log(`Fixing imports in ${file}`);
    content = content.replace(new RegExp(oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newImport);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Fixed ${file}`);
  }
}

console.log('Auth middleware import fixes complete!');
