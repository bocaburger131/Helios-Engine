const fs = require('fs');
const path = require('path');

// Check if file exists
const pdfParserPath = path.resolve('src/services/pdfParserService.js');

if (fs.existsSync(pdfParserPath)) {
  // Read file content
  let content = fs.readFileSync(pdfParserPath, 'utf8');
  
  // Check if it contains the problematic import
  if (content.includes('@/errors')) {
    // Replace the import
    content = content.replace(/(['"])@\/errors['"]/g, '$1@/utils/errors.js$1');
    
    // Save back to the file
    fs.writeFileSync(pdfParserPath, content, 'utf8');
    console.log(`✅ Fixed @/errors import in ${pdfParserPath}`);
  } else {
    console.log(`ℹ️ No @/errors import found in ${pdfParserPath}`);
  }
} else {
  console.error(`❌ File not found: ${pdfParserPath}`);
}