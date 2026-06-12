import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.resolve(__dirname, '../src/routes');

function checkRoutes() {
  if (!fs.existsSync(routesDir)) {
    console.log(`Routes directory not found: ${routesDir}`);
    return;
  }

  const files = fs.readdirSync(routesDir);
  
  files.forEach(file => {
    if (file.endsWith('.routes.js')) {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      const issues = [];
      
      lines.forEach((line, index) => {
        // Check controller imports
        if (line.includes('Controller') && line.includes('import')) {
          // Check for missing .js extension
          if (line.includes(' from ')) {
            const pathMatch = /from\s+['"]([^'"]+)['"]/.exec(line);
            if (pathMatch && pathMatch[1].startsWith('..') && !pathMatch[1].endsWith('.js')) {
              issues.push({
                line: index + 1,
                text: line.trim(),
                issue: 'Missing .js extension in import path',
                fix: line.replace(pathMatch[1], `${pathMatch[1]}.js`)
              });
            }
          }
          
          // Check for default import vs named import mismatch
          const defaultImportMatch = /import\s+(\w+)\s+from/.exec(line);
          if (defaultImportMatch) {
            const controllerName = defaultImportMatch[1];
            
            // If it looks like we're importing a named export as default
            if (controllerName.endsWith('Controller')) {
              issues.push({
                line: index + 1,
                text: line.trim(),
                issue: 'Using default import for likely named export',
                fix: line.replace(`import ${controllerName} from`, `import { ${controllerName} } from`)
              });
            }
          }
        }
      });
      
      if (issues.length > 0) {
        console.log(`\nIssues found in ${file}:`);
        issues.forEach(({line, text, issue, fix}) => {
          console.log(`  Line ${line}: ${text}`);
          console.log(`    Issue: ${issue}`);
          console.log(`    Fix: ${fix}`);
        });
      } else {
        console.log(`✓ No issues found in ${file}`);
      }
    }
  });
}

checkRoutes();