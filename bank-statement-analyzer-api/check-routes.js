import { promises as fs } from 'fs';
import path from 'path';

console.log(' Finding undefined route handlers...\n');

async function checkRouteFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];

    // Look for route definitions
    const routePattern = /router\.(get|post|put|delete|patch)\s*\(/;
    
    lines.forEach((line, index) => {
      if (routePattern.test(line)) {
        // Check if it references an undefined variable
        const match = line.match(/,\s*(\w+Controller\.\w+)/);
        if (match) {
          const handler = match[1];
          // Check if the controller is imported
          if (!content.includes(`import`) || !content.includes(handler.split('.')[0])) {
            issues.push({
              line: index + 1,
              content: line.trim(),
              handler: handler
            });
          }
        }
      }
    });

    if (issues.length > 0) {
      console.log(` ${filePath}`);
      issues.forEach(issue => {
        console.log(`   Line ${issue.line}: ${issue.content}`);
        console.log(`     Handler might be undefined: ${issue.handler}`);
      });
      console.log('');
    }

    return issues.length;
  } catch (error) {
    return 0;
  }
}

async function scanRoutes(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  let totalIssues = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory() && !file.name.includes('node_modules')) {
      totalIssues += await scanRoutes(fullPath);
    } else if (file.name.endsWith('Routes.js') || file.name.endsWith('routes.js')) {
      totalIssues += await checkRouteFile(fullPath);
    }
  }

  return totalIssues;
}

const issues = await scanRoutes('./src');
console.log(`\n Found ${issues} potential route handler issues`);

// Now let's specifically check analysisRoutes.js
console.log('\n Checking analysisRoutes.js specifically:');
const analysisContent = await fs.readFile('./src/routes/analysisRoutes.js', 'utf8');
const lines = analysisContent.split('\n');

console.log('\nLine 161 and surrounding context:');
for (let i = 155; i < 165 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
