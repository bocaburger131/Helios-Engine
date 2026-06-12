import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllersDir = path.resolve(__dirname, '../src/controllers');

function fixControllers() {
  if (!fs.existsSync(controllersDir)) {
    console.log(`Controllers directory not found: ${controllersDir}`);
    return;
  }

  const files = fs.readdirSync(controllersDir);
  let changedFiles = 0;
  
  files.forEach(file => {
    if (file.endsWith('.controller.js')) {
      const filePath = path.join(controllersDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      
      // Convert default exports to named exports
      const defaultExportMatch = /export\s+default\s+(\w+)/.exec(content);
      if (defaultExportMatch) {
        const controllerName = defaultExportMatch[1];
        content = content.replace(
          `export default ${controllerName}`,
          `export const ${controllerName}`
        );
      }
      
      // Make sure controller uses proper naming convention
      const baseName = path.basename(file, '.controller.js');
      const expectedName = baseName.charAt(0).toUpperCase() + baseName.slice(1) + 'Controller';
      
      // Check for controller declarations that don't match expected name
      const controllerDeclMatch = /const\s+(\w+)\s*=/.exec(content);
      if (controllerDeclMatch && controllerDeclMatch[1] !== expectedName) {
        content = content.replace(
          `const ${controllerDeclMatch[1]} =`,
          `const ${expectedName} =`
        );
        
        // Also update the export if it exists
        content = content.replace(
          `export const ${controllerDeclMatch[1]}`,
          `export const ${expectedName}`
        );
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        changedFiles++;
        console.log(`✓ Fixed controller exports in ${file}`);
      }
    }
  });
  
  console.log(`\nFixed exports in ${changedFiles} controller files`);
}

fixControllers();