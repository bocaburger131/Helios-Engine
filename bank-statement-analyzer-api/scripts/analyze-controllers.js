import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');
const controllersDir = path.join(srcDir, 'controllers');

/**
 * Analyzes controller files for code style and patterns
 */
function analyzeControllers() {
  console.log('Analyzing controllers for code patterns...\n');
  
  // Process all controller files
  const files = fs.readdirSync(controllersDir);
  const stats = {
    totalControllers: 0,
    totalMethods: 0,
    arrowFunctions: 0,
    traditionalMethods: 0,
    asyncMethods: 0,
    errorHandling: 0,
    validationPatterns: 0
  };
  
  const patterns = {
    controllers: [],
    methodStyles: new Set(),
    errorHandlingStyles: new Set(),
    validationStyles: new Set()
  };
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(controllersDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract controller name
      const controllerNameMatch = content.match(/class\s+(\w+Controller)/);
      if (!controllerNameMatch) continue;
      
      const controllerName = controllerNameMatch[1];
      stats.totalControllers++;
      
      // Count arrow function methods
      const arrowMethods = (content.match(/\w+\s*=\s*async\s*\([^)]*\)\s*=>/g) || []).length;
      stats.arrowFunctions += arrowMethods;
      
      // Count traditional methods
      const traditionalMethods = (content.match(/async\s+\w+\s*\([^)]*\)\s*{/g) || []).length;
      stats.traditionalMethods += traditionalMethods;
      
      // Count total methods
      const totalMethods = arrowMethods + traditionalMethods;
      stats.totalMethods += totalMethods;
      
      // Count async methods
      const asyncMethods = (content.match(/async/g) || []).length;
      stats.asyncMethods += asyncMethods;
      
      // Count try/catch blocks (error handling)
      const tryCatchBlocks = (content.match(/try\s*{/g) || []).length;
      stats.errorHandling += tryCatchBlocks;
      
      // Count validation patterns
      const validationPatterns = (content.match(/if\s*\([^)]*\)\s*{\s*return\s+res\.status\(\d+\)/g) || []).length;
      stats.validationPatterns += validationPatterns;
      
      // Determine dominant method style
      const dominantStyle = arrowMethods > traditionalMethods 
        ? 'arrow functions' 
        : traditionalMethods > arrowMethods 
          ? 'traditional methods'
          : 'mixed';
      
      // Add controller info
      patterns.controllers.push({
        name: controllerName,
        file,
        methodCount: totalMethods,
        style: dominantStyle,
        methods: {
          arrow: arrowMethods,
          traditional: traditionalMethods
        }
      });
      
      // Add method style to set
      patterns.methodStyles.add(dominantStyle);
      
      // Check error handling style
      if (content.includes('next(error)')) {
        patterns.errorHandlingStyles.add('middleware next(error)');
      }
      if (content.includes('res.status(500)')) {
        patterns.errorHandlingStyles.add('direct response');
      }
      
      // Check validation style
      if (content.includes('ValidationError')) {
        patterns.validationStyles.add('validation error class');
      }
      if (content.includes('return res.status(400)')) {
        patterns.validationStyles.add('direct response');
      }
    }
  }
  
  // Display stats
  console.log('📊 Controller Statistics:');
  console.log(`  Total controllers: ${stats.totalControllers}`);
  console.log(`  Total methods: ${stats.totalMethods}`);
  console.log(`  Arrow function methods: ${stats.arrowFunctions}`);
  console.log(`  Traditional methods: ${stats.traditionalMethods}`);
  console.log(`  Async methods: ${stats.asyncMethods}`);
  console.log(`  Error handling blocks: ${stats.errorHandling}`);
  console.log(`  Validation patterns: ${stats.validationPatterns}`);
  
  // Display method style consistency
  console.log('\n🔍 Method Style Analysis:');
  const styleConsistency = patterns.methodStyles.size === 1 
    ? '✅ Consistent' 
    : '⚠️ Inconsistent';
  
  console.log(`  Style consistency: ${styleConsistency}`);
  console.log(`  Styles in use: ${Array.from(patterns.methodStyles).join(', ')}`);
  
  // Display controller details
  console.log('\n📋 Controller Details:');
  patterns.controllers.forEach(controller => {
    console.log(`  ${controller.name} (${controller.file}):`);
    console.log(`    Methods: ${controller.methodCount} (${controller.arrow} arrow, ${controller.traditional} traditional)`);
    console.log(`    Style: ${controller.style}`);
  });
  
  // Display recommendations
  console.log('\n💡 Recommendations:');
  
  if (patterns.methodStyles.size > 1) {
    console.log('  - Standardize method style across controllers (prefer arrow functions for consistent this binding)');
  } else {
    console.log('  - Maintain consistent method style 👍');
  }
  
  if (patterns.errorHandlingStyles.size > 1) {
    console.log('  - Standardize error handling approach');
  }
  
  if (stats.arrowFunctions > 0 && stats.traditionalMethods > 0) {
    console.log('  - Convert all methods to arrow functions for consistency');
  }
}

// Run the analysis
analyzeControllers();