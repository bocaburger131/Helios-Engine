const fs = require('fs');
const path = require('path');

const filePath = path.resolve('./src/middleware/validateRequest.js');
try {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('File content:');
  console.log(content);
} catch (error) {
  console.error('Error reading file:', error);
}