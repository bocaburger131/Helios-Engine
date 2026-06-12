const fs = require('fs');
const path = require('path');

// Path to the problematic file
const filePath = path.resolve(__dirname, '../src/services/pdfParserService.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if it imports from @/errors
  if (content.includes('@/errors')) {
    // Replace with correct path
    content = content.replace(/['"]@\/errors['"]/g, '"@/utils/errors.js"');
    
    // Write the fixed file
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed import in ${filePath}`);
  } else {
    console.log(`ℹ️ No @/errors import found in ${filePath}`);
  }
} catch (error) {
  console.error(`Error fixing file: ${error.message}`);
}