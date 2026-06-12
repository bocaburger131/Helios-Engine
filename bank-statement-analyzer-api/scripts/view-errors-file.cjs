const fs = require('fs');
const path = require('path');

// Path to the errors file
const errorsFilePath = path.resolve('src/utils/errors.js');

if (fs.existsSync(errorsFilePath)) {
  const content = fs.readFileSync(errorsFilePath, 'utf8');
  console.log('Current content of errors.js:');
  console.log('='.repeat(50));
  console.log(content);
  console.log('='.repeat(50));
} else {
  console.error('❌ File not found:', errorsFilePath);
}