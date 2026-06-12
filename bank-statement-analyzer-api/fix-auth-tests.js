import fs from 'fs';
import path from 'path';

const testFilePath = 'src/routes/AuthRoute.test.js';
let content = fs.readFileSync(testFilePath, 'utf8');

// Fix all statementController method calls to include mockNext
content = content.replace(
  /await statementController\.(\w+)\(mockReq, mockRes\);/g,
  'await statementController.$1(mockReq, mockRes, mockNext);'
);

// Write back the file
fs.writeFileSync(testFilePath, content);
console.log('Fixed all statementController method calls');
