import fs from 'fs';

const content = fs.readFileSync('./src/controllers/statementController.js', 'utf8');
const lines = content.split('\n');

console.log('Looking for export statements...\n');

lines.forEach((line, index) => {
    if (line.includes('export default') || line.includes('export {')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});