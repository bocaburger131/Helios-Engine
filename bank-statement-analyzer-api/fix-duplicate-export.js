import fs from 'fs';

const filePath = './src/controllers/statementController.js';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Checking line 289 area...\n');

// Show context around line 289
for (let i = 285; i < 295 && i < lines.length; i++) {
    console.log(`Line ${i + 1}: ${lines[i]}`);
}

console.log('\n\nChecking end of file...\n');

// Show last 10 lines
for (let i = Math.max(0, lines.length - 10); i < lines.length; i++) {
    console.log(`Line ${i + 1}: ${lines[i]}`);
}

// If confirmed, we can fix it
console.log('\n\nTo fix: Remove the export at line 289 and keep only the class export at the end.');