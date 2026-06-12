/**
 * Comprehensive API Security Validation
 * 
 * This script validates the complete security implementation
 * and provides a detailed report of the security posture.
 */

import fs from 'fs';
import path from 'path';

// Security checklist for the API
const securityChecklist = [
  {
    category: 'Authentication Middleware',
    checks: [
      {
        name: 'JWT Authentication Middleware',
        file: 'src/middleware/auth.middleware.js',
        validate: (content) => {
          return content.includes('authenticateToken') && 
                 content.includes('401') && 
                 content.includes('Bearer');
        }
      },
      {
        name: 'API Key Authentication Middleware',
        file: 'src/middleware/apiKeyAuth.js',
        validate: (content) => {
          return content.includes('validateApiKey') && 
                 content.includes('X-API-Key') && 
                 content.includes('401');
        }
      }
    ]
  },
  {
    category: 'Security Headers',
    checks: [
      {
        name: 'Security Headers Middleware',
        file: 'src/middleware/security.js',
        validate: (content) => {
          return content.includes('securityHeaders') && 
                 content.includes('X-Content-Type-Options') && 
                 content.includes('X-Frame-Options') &&
                 content.includes('X-XSS-Protection');
        }
      }
    ]
  },
  {
    category: 'OpenAPI Security Definitions',
    checks: [
      {
        name: 'Swagger Security Schemes',
        file: 'src/config/swagger.js',
        validate: (content) => {
          return content.includes('ApiKeyAuth') && 
                 content.includes('BearerAuth') && 
                 content.includes('UnauthorizedError') &&
                 content.includes('ForbiddenError');
        }
      }
    ]
  },
  {
    category: 'Route Security',
    checks: [
      {
        name: 'Protected Routes Implementation',
        file: 'src/routes/statementRoutes.js',
        validate: (content) => {
          return content.includes('authenticateToken') && 
                 content.includes('validateApiKey') && 
                 !content.includes('createPlaceholder') &&
                 !content.includes('status(501)');
        }
      }
    ]
  },
  {
    category: 'App Security Setup',
    checks: [
      {
        name: 'App Security Configuration',
        file: 'src/app.js',
        validate: (content) => {
          return content.includes('securityHeaders') && 
                 content.includes('requestId') && 
                 content.includes('responseTime');
        }
      }
    ]
  }
];

// Validate security implementation
const validateSecurity = () => {
  console.log('🔒 Bank Statement Analyzer - Security Validation Report');
  console.log('======================================================\n');

  let totalChecks = 0;
  let passedChecks = 0;
  const results = [];

  securityChecklist.forEach(category => {
    console.log(`📋 ${category.category}`);
    console.log('─'.repeat(50));

    const categoryResults = {
      category: category.category,
      checks: [],
      passed: 0,
      total: category.checks.length
    };

    category.checks.forEach(check => {
      totalChecks++;
      const filePath = path.join(process.cwd(), check.file);
      
      try {
        if (!fs.existsSync(filePath)) {
          console.log(`❌ ${check.name}: File not found (${check.file})`);
          categoryResults.checks.push({
            name: check.name,
            status: 'FAILED',
            reason: 'File not found'
          });
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const isValid = check.validate(content);

        if (isValid) {
          console.log(`✅ ${check.name}: PASSED`);
          passedChecks++;
          categoryResults.passed++;
          categoryResults.checks.push({
            name: check.name,
            status: 'PASSED'
          });
        } else {
          console.log(`❌ ${check.name}: FAILED - Implementation not found`);
          categoryResults.checks.push({
            name: check.name,
            status: 'FAILED',
            reason: 'Implementation not found'
          });
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ERROR - ${error.message}`);
        categoryResults.checks.push({
          name: check.name,
          status: 'ERROR',
          reason: error.message
        });
      }
    });

    results.push(categoryResults);
    console.log(`\n📊 Category Score: ${categoryResults.passed}/${categoryResults.total}\n`);
  });

  // Overall summary
  console.log('🎯 SECURITY VALIDATION SUMMARY');
  console.log('==============================');
  console.log(`Overall Score: ${passedChecks}/${totalChecks} (${Math.round((passedChecks/totalChecks) * 100)}%)`);
  
  if (passedChecks === totalChecks) {
    console.log('🟢 Security implementation is COMPLETE');
  } else if (passedChecks >= totalChecks * 0.8) {
    console.log('🟡 Security implementation is MOSTLY COMPLETE');
  } else {
    console.log('🔴 Security implementation needs ATTENTION');
  }

  console.log('\n📋 DETAILED BREAKDOWN:');
  results.forEach(category => {
    console.log(`\n${category.category}: ${category.passed}/${category.total}`);
    category.checks.forEach(check => {
      const icon = check.status === 'PASSED' ? '✅' : '❌';
      const reason = check.reason ? ` (${check.reason})` : '';
      console.log(`  ${icon} ${check.name}${reason}`);
    });
  });

  // Security recommendations
  console.log('\n🛡️  SECURITY RECOMMENDATIONS:');
  console.log('1. Regularly rotate API keys');
  console.log('2. Implement rate limiting for all endpoints');
  console.log('3. Add request logging for security monitoring');
  console.log('4. Use HTTPS in production');
  console.log('5. Implement API versioning for security updates');
  console.log('6. Add input validation for all endpoints');
  console.log('7. Implement CORS properly for production domains');

  return { passedChecks, totalChecks, results };
};

// Check specific security features
const checkSpecificFeatures = () => {
  console.log('\n🔍 SPECIFIC SECURITY FEATURES CHECK:');
  console.log('====================================');

  // Check for proper error responses
  const authFile = path.join(process.cwd(), 'src/middleware/auth.middleware.js');
  if (fs.existsSync(authFile)) {
    const content = fs.readFileSync(authFile, 'utf-8');
    
    console.log('Authentication Error Responses:');
    console.log(`  401 Unauthorized: ${content.includes('401') ? '✅' : '❌'}`);
    console.log(`  403 Forbidden: ${content.includes('403') ? '✅' : '❌'}`);
    console.log(`  500 Server Error: ${content.includes('500') ? '✅' : '❌'}`);
  }

  // Check for API key validation
  const apiKeyFile = path.join(process.cwd(), 'src/middleware/apiKeyAuth.js');
  if (fs.existsSync(apiKeyFile)) {
    const content = fs.readFileSync(apiKeyFile, 'utf-8');
    
    console.log('\nAPI Key Security:');
    console.log(`  Key Validation: ${content.includes('VALID_API_KEYS') ? '✅' : '❌'}`);
    console.log(`  Header Check: ${content.includes('X-API-Key') ? '✅' : '❌'}`);
    console.log(`  Error Responses: ${content.includes('API_KEY_MISSING') ? '✅' : '❌'}`);
  }

  // Check Swagger security definitions
  const swaggerFile = path.join(process.cwd(), 'src/config/swagger.js');
  if (fs.existsSync(swaggerFile)) {
    const content = fs.readFileSync(swaggerFile, 'utf-8');
    
    console.log('\nSwagger Security:');
    console.log(`  Security Schemes: ${content.includes('securitySchemes') ? '✅' : '❌'}`);
    console.log(`  Error Responses: ${content.includes('UnauthorizedError') ? '✅' : '❌'}`);
    console.log(`  Examples: ${content.includes('examples') ? '✅' : '❌'}`);
  }
};

// Main execution
console.log('Starting comprehensive security validation...\n');

const validationResults = validateSecurity();
checkSpecificFeatures();

console.log('\n🏁 Security validation completed!');
console.log('\nNext steps:');
console.log('1. Start the server: npm start');
console.log('2. Run security tests: node test-security.js');
console.log('3. Check Swagger UI: http://localhost:3000/api-docs');
console.log('4. Test API endpoints with proper authentication');

export default validationResults;
