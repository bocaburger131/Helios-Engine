import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function checkServerFile() {
  try {
    const serverPath = path.join(rootDir, 'src', 'server.js');
    const content = await fs.readFile(serverPath, 'utf-8');
    
    // Check for duplicate function declarations
    const functionMatches = content.match(/function\s+startServer|const\s+startServer|let\s+startServer|var\s+startServer/g);
    
    if (functionMatches && functionMatches.length > 1) {
      console.log(`❌ Found ${functionMatches.length} declarations of startServer:`);
      functionMatches.forEach((match, index) => {
        console.log(`   ${index + 1}. ${match}`);
      });
      
      // Find line numbers
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('function startServer') || 
            line.includes('const startServer') || 
            line.includes('let startServer') ||
            line.includes('var startServer')) {
          console.log(`   Line ${index + 1}: ${line.trim()}`);
        }
      });
    } else {
      console.log('✅ No duplicate startServer declarations found');
    }
    
    // Check file size
    console.log(`\nFile size: ${content.length} characters`);
    console.log(`Number of lines: ${content.split('\n').length}`);
    
  } catch (error) {
    console.error('Error reading server.js:', error);
  }
}

checkServerFile();