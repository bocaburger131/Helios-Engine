const fs = require('fs');
const path = require('path');

// Path to the errors utility file
const errorsFilePath = path.resolve('src/utils/errors.js');

if (fs.existsSync(errorsFilePath)) {
  let content = fs.readFileSync(errorsFilePath, 'utf8');
  
  // Check if we need to add the status property
  if (content.includes('class AppError extends Error') && !content.includes('this.status')) {
    // Find the constructor of AppError and add the status property
    content = content.replace(
      /(constructor\s*\([^)]*\)\s*{[^}]*)(this\.isOperational\s*=\s*true)/,
      '$1$2\n        this.status = this.statusCode >= 500 ? \'error\' : \'fail\';'
    );
    
    fs.writeFileSync(errorsFilePath, content, 'utf8');
    console.log(`✅ Added status property to AppError class in ${errorsFilePath}`);
  } else {
    console.log(`ℹ️ No changes needed for AppError class in ${errorsFilePath}`);
  }
} else {
  console.error(`❌ File not found: ${errorsFilePath}`);
}