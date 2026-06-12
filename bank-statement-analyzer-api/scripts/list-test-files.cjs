const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('tests/**/*.test.js');

console.log(`Found ${testFiles.length} test files:`);
testFiles.forEach(file => console.log(`- ${file}`));