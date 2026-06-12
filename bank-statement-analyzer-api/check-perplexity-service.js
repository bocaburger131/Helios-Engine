import fs from 'fs';

const content = fs.readFileSync('./src/services/perplexityEnhancementService.js', 'utf8');

// Check if generateBasicInsights exists
if (content.includes('generateBasicInsights')) {
    console.log('✅ generateBasicInsights method exists');
    
    // Find where it's called
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('generateBasicInsights')) {
            console.log(`Line ${index + 1}: ${line.trim()}`);
        }
    });
} else {
    console.log('❌ generateBasicInsights method is missing');
}

// Check class structure
const classMatch = content.match(/class\s+\w+\s*{/);
if (classMatch) {
    console.log('\nClass found:', classMatch[0]);
}

// List all methods
console.log('\nMethods found:');
const methodMatches = content.matchAll(/^\s*(async\s+)?(\w+)\s*\(/gm);
for (const match of methodMatches) {
    console.log('  -', match[2]);
}