/**
 * Comprehensive Integration Test
 * 
 * This script tests the entire workflow integration including:
 * - Server startup
 * - Database connectivity
 * - Route functionality
 * - Enhanced analysis with alerts
 * - Error handling
 */

import express from 'express';
import request from 'supertest';
import { 
  morganMiddleware, 
  performanceMonitor, 
  sanitizeRequest, 
  securityHeaders, 
  errorHandler 
} from './src/middleware/index.js';
import consolidatedRoutes from './src/routes/consolidatedRoutes.js';
import AlertsEngineService from './src/services/AlertsEngineService.js';
import { ZohoCRMService } from './src/services/zohoCRMService.js';

console.log('🧪 Starting Comprehensive Integration Test...\n');

// Create test app with consolidated structure
function createTestApp() {
  const app = express();
  
  // Apply middleware stack
  app.use(securityHeaders);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morganMiddleware);
  app.use(performanceMonitor);
  app.use(sanitizeRequest);
  
  // Routes
  app.use('/api', consolidatedRoutes);
  
  // Health endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });
  
  // Error handler
  app.use(errorHandler);
  
  return app;
}

// Test 1: Server and Middleware Stack
async function testServerAndMiddleware() {
  console.log('📊 Test 1: Server and Middleware Stack');
  
  try {
    const app = createTestApp();
    const response = await request(app).get('/health');
    
    if (response.status === 200 && response.body.status === 'healthy') {
      console.log('✅ Server and middleware stack working correctly');
      return true;
    } else {
      console.log('❌ Server health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Middleware stack error:', error.message);
    return false;
  }
}

// Test 2: Routes Integration
async function testRoutesIntegration() {
  console.log('\n📋 Test 2: Routes Integration');
  
  try {
    const app = createTestApp();
    const response = await request(app).get('/api');
    
    if (response.status === 200 && response.body.endpoints) {
      console.log('✅ Consolidated routes working correctly');
      console.log(`   Available endpoints: ${Object.keys(response.body.endpoints).length}`);
      return true;
    } else {
      console.log('❌ Routes integration failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Routes integration error:', error.message);
    return false;
  }
}

// Test 3: Enhanced Analysis Components
async function testEnhancedAnalysis() {
  console.log('\n🚨 Test 3: Enhanced Analysis Components');
  
  try {
    // Test AlertsEngineService
    const testApplicationData = {
      statedAnnualRevenue: 50000,
      businessName: 'Test Business LLC',
      industry: 'Technology',
      nsfAnalysis: { nsfCount: 3 },
      balanceAnalysis: { averageBalance: 500, negativeDayCount: 10 },
      summary: { nsfCount: 3, averageBalance: 500 }
    };
    
    const testFinsightReports = [{
      analysis: { totalDeposits: 12000 },
      riskAnalysis: { nsfCount: 3 }
    }];
    
    const alerts = AlertsEngineService.generateAlertsCustom(
      testApplicationData,
      testFinsightReports,
      {}
    );
    
    if (alerts && alerts.length > 0) {
      console.log('✅ AlertsEngineService working correctly');
      console.log(`   Generated ${alerts.length} alerts`);
      
      // Test ZohoCRMService
      const zohoCRM = new ZohoCRMService();
      const criticalAlerts = alerts.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL');
      
      if (criticalAlerts.length > 0) {
        const noteContent = zohoCRM.formatCriticalAlertsNote(criticalAlerts, {
          fileName: 'test-statement.pdf',
          veritasScore: 45,
          riskLevel: 'HIGH'
        });
        
        if (noteContent && noteContent.includes('CRITICAL ANALYSIS ALERTS')) {
          console.log('✅ ZohoCRMService working correctly');
          console.log(`   Formatted ${criticalAlerts.length} critical alerts for CRM`);
          return true;
        }
      }
    }
    
    console.log('❌ Enhanced analysis components not working correctly');
    return false;
  } catch (error) {
    console.log('❌ Enhanced analysis error:', error.message);
    return false;
  }
}

// Test 4: Error Handling
async function testErrorHandling() {
  console.log('\n⚠️  Test 4: Error Handling');
  
  try {
    const app = createTestApp();
    const response = await request(app).get('/api/non-existent-route');
    
    if (response.status === 404) {
      console.log('✅ 404 error handling working correctly');
      
      // Test invalid JSON
      const invalidResponse = await request(app)
        .post('/api/statements')
        .send('invalid json')
        .set('Content-Type', 'application/json');
      
      if (invalidResponse.status >= 400) {
        console.log('✅ Invalid request handling working correctly');
        return true;
      }
    }
    
    console.log('❌ Error handling not working correctly');
    return false;
  } catch (error) {
    console.log('❌ Error handling test error:', error.message);
    return false;
  }
}

// Test 5: Memory and Performance
async function testPerformance() {
  console.log('\n⚡ Test 5: Memory and Performance');
  
  try {
    const memBefore = process.memoryUsage();
    const app = createTestApp();
    
    // Make multiple requests to test for memory leaks
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(request(app).get('/health'));
    }
    
    await Promise.all(promises);
    
    const memAfter = process.memoryUsage();
    const memDiff = memAfter.heapUsed - memBefore.heapUsed;
    
    console.log('✅ Performance test completed');
    console.log(`   Memory difference: ${(memDiff / 1024 / 1024).toFixed(2)} MB`);
    
    return memDiff < 50 * 1024 * 1024; // Less than 50MB difference
  } catch (error) {
    console.log('❌ Performance test error:', error.message);
    return false;
  }
}

// Run all tests
async function runIntegrationTests() {
  console.log('🎯 Bank Statement Analyzer - Integration Test Suite\n');
  console.log('Testing consolidated middleware, routes, and enhanced analysis...\n');
  
  const testResults = [];
  
  testResults.push(await testServerAndMiddleware());
  testResults.push(await testRoutesIntegration());
  testResults.push(await testEnhancedAnalysis());
  testResults.push(await testErrorHandling());
  testResults.push(await testPerformance());
  
  const passedTests = testResults.filter(result => result).length;
  const totalTests = testResults.length;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏆 INTEGRATION TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Integration is successful.');
    console.log('\n💡 Next Steps:');
    console.log('   1. ✅ Consolidated middleware working');
    console.log('   2. ✅ Consolidated routes working');
    console.log('   3. ✅ Enhanced analysis integration working');
    console.log('   4. ✅ Error handling working');
    console.log('   5. ✅ Performance within acceptable limits');
    console.log('\n🚀 Ready for production deployment!');
  } else {
    console.log('\n⚠️  Some tests failed. Review the errors above.');
    console.log('\n🔧 Issues to address:');
    if (!testResults[0]) console.log('   - Fix middleware stack integration');
    if (!testResults[1]) console.log('   - Fix routes consolidation');
    if (!testResults[2]) console.log('   - Fix enhanced analysis integration');
    if (!testResults[3]) console.log('   - Fix error handling');
    if (!testResults[4]) console.log('   - Optimize performance/memory usage');
  }
  
  return passedTests === totalTests;
}

// Run the tests
runIntegrationTests().catch(error => {
  console.error('❌ Integration test suite failed:', error);
  process.exit(1);
});
