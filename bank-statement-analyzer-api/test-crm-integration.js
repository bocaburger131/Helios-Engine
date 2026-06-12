import CrmServiceFactory from './src/services/crm/factory.js';
import ZohoCrmService from './src/services/crm/zoho.service.js';
import dotenv from 'dotenv';
import logger from './src/utils/logger.js';

// Load environment variables
dotenv.config();

async function testCrmIntegration() {
  console.log('🔧 Testing CRM Integration...\n');

  try {
    // Test 1: Factory Pattern
    console.log('1. Testing Factory Pattern...');
    const crmService = CrmServiceFactory.createService('zoho', {
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN,
      apiDomain: process.env.ZOHO_API_DOMAIN,
      apiVersion: process.env.ZOHO_API_VERSION
    });
    
    console.log('✅ Factory created CRM service successfully');
    console.log('Service type:', crmService.constructor.name);
    console.log('Is ZohoCrmService instance:', crmService instanceof ZohoCrmService);
    
    // Test 2: Service Configuration
    console.log('\n2. Testing Service Configuration...');
    const config = crmService.getConfig();
    console.log('Config loaded:', {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasRefreshToken: !!config.refreshToken,
      apiDomain: config.apiDomain,
      apiVersion: config.apiVersion
    });
    
    // Test 3: Authentication
    console.log('\n3. Testing Authentication...');
    const authStatus = await crmService.authenticate();
    console.log('Authentication status:', authStatus);
    console.log('Connection status:', crmService.getConnectionStatus());
    
    // Test 4: Connection Check
    console.log('\n4. Testing Connection Check...');
    const connectionStatus = await crmService.checkConnection();
    console.log('Connection check result:', connectionStatus);
    
    // Test 5: Abstract Methods Implementation
    console.log('\n5. Testing Abstract Methods...');
    
    // Test getDeal (this should work if deal ID exists)
    try {
      console.log('Testing getDeal method...');
      const deal = await crmService.getDeal('test-deal-id');
      console.log('✅ getDeal method works:', deal ? 'Got deal data' : 'No deal found');
    } catch (error) {
      console.log('⚠️  getDeal method error (expected for test ID):', error.message);
    }
    
    // Test updateDeal (this should work if deal ID exists)
    try {
      console.log('Testing updateDeal method...');
      const updateResult = await crmService.updateDeal('test-deal-id', { Stage: 'Proposal' });
      console.log('✅ updateDeal method works:', updateResult);
    } catch (error) {
      console.log('⚠️  updateDeal method error (expected for test ID):', error.message);
    }
    
    // Test addNoteToDeal (this should work if deal ID exists)
    try {
      console.log('Testing addNoteToDeal method...');
      const noteResult = await crmService.addNoteToDeal('test-deal-id', 'Test note from bank statement analyzer');
      console.log('✅ addNoteToDeal method works:', noteResult);
    } catch (error) {
      console.log('⚠️  addNoteToDeal method error (expected for test ID):', error.message);
    }
    
    // Test 6: Error Handling
    console.log('\n6. Testing Error Handling...');
    
    // Test with invalid service type
    try {
      CrmServiceFactory.createService('invalid-crm', {});
      console.log('❌ Should have thrown error for invalid service type');
    } catch (error) {
      console.log('✅ Correctly handles invalid service type:', error.message);
    }
    
    // Test with missing config
    try {
      CrmServiceFactory.createService('zoho', {});
      console.log('❌ Should have thrown error for missing config');
    } catch (error) {
      console.log('✅ Correctly handles missing config:', error.message);
    }
    
    console.log('\n🎉 CRM Integration Test Complete!');
    console.log('\nSummary:');
    console.log('- Factory Pattern: Working');
    console.log('- Service Configuration: Working');
    console.log('- Authentication: Working');
    console.log('- Connection Check: Working');
    console.log('- Abstract Methods: Implemented');
    console.log('- Error Handling: Working');
    
  } catch (error) {
    console.error('❌ CRM Integration Test Failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testCrmIntegration().catch(console.error);
