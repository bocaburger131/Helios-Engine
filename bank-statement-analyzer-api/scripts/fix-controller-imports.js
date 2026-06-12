import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const routesDir = path.join(rootDir, 'src/routes');

function fixControllerImports() {
  if (!fs.existsSync(routesDir)) {
    console.log(`Routes directory not found: ${routesDir}`);
    return;
  }

  const files = fs.readdirSync(routesDir);
  let fixedCount = 0;
  
  files.forEach(file => {
    if (file.endsWith('.routes.js') || file.endsWith('.route.js')) {
      const filePath = path.join(routesDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Fix 1: Add .js extension to controller imports
      const controllerImportRegex = /import\s+(?:{[^}]*}|\w+)\s+from\s+['"]([^'"]*controller)['"]/g;
      let match;
      while ((match = controllerImportRegex.exec(originalContent)) !== null) {
        const importPath = match[1];
        if (!importPath.endsWith('.js')) {
          content = content.replace(
            `from '${importPath}'`, 
            `from '${importPath}.js'`
          ).replace(
            `from "${importPath}"`, 
            `from "${importPath}.js"`
          );
        }
      }
      
      // Fix 2: Convert default imports of controllers to named imports
      const defaultControllerImportRegex = /import\s+(\w+Controller)\s+from\s+['"]([^'"]+)['"]/g;
      while ((match = defaultControllerImportRegex.exec(originalContent)) !== null) {
        const controllerName = match[1];
        const importStatement = match[0];
        
        content = content.replace(
          importStatement,
          importStatement.replace(
            `import ${controllerName}`,
            `import { ${controllerName} }`
          )
        );
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        fixedCount++;
        console.log(`✓ Fixed controller imports in ${file}`);
      }
    }
  });
  
  console.log(`\nFixed controller imports in ${fixedCount} files`);
}

fixControllerImports();