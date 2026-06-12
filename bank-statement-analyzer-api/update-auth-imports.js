import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to update authentication imports across all route files
 * Automatically updates imports from old auth files to consolidated auth.middleware.js
 */

const routesDir = path.join(__dirname, 'src', 'routes');

// Import mapping from old files to new consolidated file
const importMappings = [
  {
    oldPattern: /import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]\.\.\/middleware\/auth\.js['"];?/g,
    newTemplate: "import { $1 } from '../middleware/auth.middleware.js';"
  },
  {
    oldPattern: /import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]\.\.\/middleware\/authenticate\.js['"];?/g,
    newTemplate: "import { $1 } from '../middleware/auth.middleware.js';"
  },
  {
    oldPattern: /import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]\.\.\/middleware\/authMiddleware\.js['"];?/g,
    newTemplate: "import { $1 } from '../middleware/auth.middleware.js';"
  },
  // Handle default imports
  {
    oldPattern: /import\s+(\w+)\s+from\s+['"]\.\.\/middleware\/auth\.js['"];?/g,
    newTemplate: "import { authenticateUser as $1 } from '../middleware/auth.middleware.js';"
  },
  {
    oldPattern: /import\s+(\w+)\s+from\s+['"]\.\.\/middleware\/authenticate\.js['"];?/g,
    newTemplate: "import { authenticateUser as $1 } from '../middleware/auth.middleware.js';"
  },
  {
    oldPattern: /import\s+(\w+)\s+from\s+['"]\.\.\/middleware\/authMiddleware\.js['"];?/g,
    newTemplate: "import { authMiddleware as $1 } from '../middleware/auth.middleware.js';"
  }
];

// Files that need import updates
const routeFiles = [
  'analysisRoutes.js',
  'transactionRoutes.js', 
  'zohoRoutes.js',
  'statementRoutes.js',
  'enhancedStatementRoutes.js',
  'enhancementRoutes.js',
  'merchantRoutes.js',
  'queryRoutes.js',
  'statement.routes.js',
  'settingsRoutes.js',
  'analysis.routes.js'
];

async function updateAuthImports() {
  console.log('🔄 Updating authentication imports across route files...');
  console.log('═══════════════════════════════════════════════════════════');

  let totalUpdates = 0;
  let filesUpdated = 0;

  for (const fileName of routeFiles) {
    const filePath = path.join(routesDir, fileName);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${fileName}`);
      continue;
    }

    try {
      // Read file content
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let fileUpdates = 0;

      console.log(`\n📁 Processing: ${fileName}`);

      // Apply each import mapping
      for (const mapping of importMappings) {
        const matches = content.match(mapping.oldPattern);
        if (matches) {
          content = content.replace(mapping.oldPattern, mapping.newTemplate);
          fileUpdates += matches.length;
          
          matches.forEach(match => {
            console.log(`  ✅ Updated: ${match.trim()}`);
          });
        }
      }

      // Write updated content if changes were made
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  📝 ${fileUpdates} imports updated in ${fileName}`);
        filesUpdated++;
        totalUpdates += fileUpdates;
      } else {
        console.log(`  ✨ No auth imports found in ${fileName}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`✅ Import update complete!`);
  console.log(`📊 Summary:`);
  console.log(`   • Files processed: ${routeFiles.length}`);
  console.log(`   • Files updated: ${filesUpdated}`);
  console.log(`   • Total imports updated: ${totalUpdates}`);
  
  if (totalUpdates > 0) {
    console.log('\n🚀 Next steps:');
    console.log('   1. Test your application to ensure all routes work correctly');
    console.log('   2. Delete the redundant auth files:');
    console.log('      - src/middleware/auth.js');
    console.log('      - src/middleware/authenticate.js');  
    console.log('      - src/middleware/authMiddleware.js');
    console.log('   3. Commit your changes');
  }

  return {
    filesProcessed: routeFiles.length,
    filesUpdated,
    totalUpdates
  };
}

// Show available authentication methods from consolidated file
function showAuthMethods() {
  console.log('\n📚 Available Authentication Methods in auth.middleware.js:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔐 authenticateUser     - Full user auth with DB lookup');
  console.log('⚡ authenticateToken    - Lightweight token-only auth');
  console.log('👑 authenticateAdmin    - Admin role required');
  console.log('🔓 optionalAuth         - Optional authentication');
  console.log('🛠️  authMiddleware       - Development mock auth');
  console.log('🛡️  requireOwnership    - Resource ownership check');
  console.log('🔧 generateToken        - JWT token generation');
  console.log('✅ verifyToken          - Token verification utility');
  console.log('🆔 extractUserIdFromToken - Extract user ID from token');
  console.log('\n💡 Usage examples:');
  console.log('   import { authenticateUser, authenticateToken } from "../middleware/auth.middleware.js";');
  console.log('   router.get("/protected", authenticateUser, handler);');
  console.log('   router.get("/api-only", authenticateToken, handler);');
}

// Validate the updated imports
async function validateUpdates() {
  console.log('\n🔍 Validating updated imports...');
  
  const authMiddlewarePath = path.join(__dirname, 'src', 'middleware', 'auth.middleware.js');
  
  if (!fs.existsSync(authMiddlewarePath)) {
    console.error('❌ auth.middleware.js not found!');
    return false;
  }

  try {
    // Try to read and basic parse the consolidated auth file
    const authContent = fs.readFileSync(authMiddlewarePath, 'utf8');
    
    const expectedExports = [
      'authenticateUser',
      'authenticateToken', 
      'authenticateAdmin',
      'optionalAuth',
      'authMiddleware',
      'requireOwnership',
      'generateToken',
      'verifyToken'
    ];

    let allExportsFound = true;
    for (const exportName of expectedExports) {
      if (!authContent.includes(`export const ${exportName}`)) {
        console.error(`❌ Missing export: ${exportName}`);
        allExportsFound = false;
      }
    }

    if (allExportsFound) {
      console.log('✅ All expected exports found in auth.middleware.js');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error validating auth.middleware.js:', error.message);
    return false;
  }
  
  return false;
}

// Main execution
async function main() {
  try {
    console.log('🚀 Authentication Import Updater');
    console.log('This script will update all route files to use the consolidated auth.middleware.js\n');

    // Validate consolidated file exists and is correct
    const isValid = await validateUpdates();
    if (!isValid) {
      console.error('❌ Validation failed. Please check auth.middleware.js');
      process.exit(1);
    }

    // Update imports
    const results = await updateAuthImports();

    // Show available methods
    showAuthMethods();

    console.log('\n🎉 Import update process completed successfully!');
    
    if (results.totalUpdates === 0) {
      console.log('💡 No authentication imports needed updating.');
    }

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updateAuthImports, validateUpdates, showAuthMethods };
