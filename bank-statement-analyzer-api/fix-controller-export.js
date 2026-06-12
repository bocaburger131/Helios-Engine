import fs from 'fs';

const filePath = './src/controllers/statementController.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find and remove the object export around line 289
const lines = content.split('\n');
let inExportBlock = false;
let exportStartLine = -1;
let exportEndLine = -1;

lines.forEach((line, index) => {
  if (line.trim() === 'export default {') {
    inExportBlock = true;
    exportStartLine = index;
  }
  if (inExportBlock && line.trim() === '}') {
    exportEndLine = index;
    inExportBlock = false;
  }
});

if (exportStartLine >= 0 && exportEndLine >= 0) {
  console.log(`Found export block from line ${exportStartLine + 1} to ${exportEndLine + 1}`);
  console.log('Removing it...');
  
  // Remove the export block
  lines.splice(exportStartLine, exportEndLine - exportStartLine + 1);
  
  // Write back
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('✅ Fixed! Removed duplicate export.');
} else {
  console.log('Could not find the export block to remove.');
}