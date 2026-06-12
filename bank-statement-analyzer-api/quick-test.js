import fs from 'fs';

// Create a test file
const testContent = 'Quick test file for GCS upload';
fs.writeFileSync('quick-test.txt', testContent);

console.log('✅ Created quick-test.txt');
console.log('\n📤 To upload this file:');
console.log('1. Open test-multi-upload.html in your browser');
console.log('2. Select quick-test.txt');
console.log('3. Click Upload');
console.log('\nOr use curl:');
console.log('curl -X POST -F "files=@quick-test.txt" http://localhost:3000/api/test/multi-upload');