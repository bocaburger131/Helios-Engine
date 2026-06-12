import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');
const controllersDir = path.join(srcDir, 'controllers');
const routesDir = path.join(srcDir, 'routes');

/**
 * Fixes controller exports to provide both named and default exports
 */
function fixControllerExports() {
  console.log('Fixing controller exports...');
  
  // Process all controller files
  const files = fs.readdirSync(controllersDir);
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(controllersDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Extract the controller class name
      const classNameMatch = content.match(/class\s+(\w+Controller)/);
      if (!classNameMatch) {
        console.log(`⚠️ Could not find controller class in ${file}`);
        continue;
      }
      
      const className = classNameMatch[1];
      
      // Check if it already has a named export
      const hasNamedExport = content.includes(`export class ${className}`);
      
      // Check if it already has a default export
      const hasDefaultExport = content.includes('export default');
      
      if (!hasNamedExport) {
        // Replace 'class ControllerName' with 'export class ControllerName'
        content = content.replace(`class ${className}`, `export class ${className}`);
        console.log(`✅ Added named export for ${className} in ${file}`);
      }
      
      if (!hasDefaultExport) {
        // Add default export at the end of the file
        content += `\n\n// Also export an instance as default export\nexport default new ${className}();\n`;
        console.log(`✅ Added default export for ${className} in ${file}`);
      }
      
      // Write the modified content back to the file
      fs.writeFileSync(filePath, content);
    }
  }
  
  console.log('\nController exports fixed successfully!');
}

/**
 * Checks and lists route imports to see if they match controller exports
 */
function checkRouteImports() {
  console.log('\nChecking route imports...');
  
  // Process all route files
  const files = fs.readdirSync(routesDir);
  let issues = 0;
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find controller imports
      const importMatches = content.matchAll(/import\s+(?:{?\s*(\w+Controller)\s*}?|\s*(\w+)\s*)\s+from\s+['"]\.\.\/controllers\/(\w+)\.controller\.js['"]/g);
      
      for (const match of Array.from(importMatches)) {
        const namedImport = match[1];
        const defaultImport = match[2];
        const controllerFile = match[3];
        
        if (namedImport) {
          console.log(`📍 Route ${file} uses named import: { ${namedImport} }`);
        } else if (defaultImport) {
          console.log(`📍 Route ${file} uses default import: ${defaultImport}`);
        }
        
        // Check if the controller file exists
        const controllerPath = path.join(controllersDir, `${controllerFile}.controller.js`);
        if (!fs.existsSync(controllerPath)) {
          console.log(`❌ Controller file not found: ${controllerFile}.controller.js`);
          issues++;
          continue;
        }
        
        // Read the controller file
        const controllerContent = fs.readFileSync(controllerPath, 'utf8');
        
        // Check if named export exists
        if (namedImport && !controllerContent.includes(`export class ${namedImport}`)) {
          console.log(`❌ Route ${file} imports { ${namedImport} } but controller doesn't export it`);
          issues++;
        }
        
        // Check if default export exists
        if (defaultImport && !controllerContent.includes('export default')) {
          console.log(`❌ Route ${file} imports default but controller doesn't export default`);
          issues++;
        }
      }
    }
  }
  
  if (issues === 0) {
    console.log('✅ All route imports match controller exports');
  } else {
    console.log(`⚠️ Found ${issues} issues with route imports`);
  }
}

// Run the fix
fixControllerExports();
checkRouteImports();

console.log('\nTo test the results, run: npm run test:basic');