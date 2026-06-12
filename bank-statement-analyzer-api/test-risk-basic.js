// Test basic risk service functions
import { service as riskAnalysisService } from './src/services/riskAnalysisService.js';

console.log('=== TESTING BASIC RISK FUNCTIONS ===');
console.log('riskAnalysisService:', typeof riskAnalysisService);
console.log('Keys:', Object.keys(riskAnalysisService || {}));

// Test calculateNSFCount
try {
  console.log('\n1. Testing calculateNSFCount...');
  const nsfResult = riskAnalysisService.calculateNSFCount([]);
  console.log('calculateNSFCount([]) =', nsfResult);
  console.log('Type:', typeof nsfResult);
} catch (error) {
  console.error('calculateNSFCount error:', error.message);
}

// Test calculateTotalDepositsAndWithdrawals  
try {
  console.log('\n2. Testing calculateTotalDepositsAndWithdrawals...');
  const totalsResult = riskAnalysisService.calculateTotalDepositsAndWithdrawals([]);
  console.log('calculateTotalDepositsAndWithdrawals([]) =', totalsResult);
  console.log('Type:', typeof totalsResult);
} catch (error) {
  console.error('calculateTotalDepositsAndWithdrawals error:', error.message);
}

// Test with sample data
try {
  console.log('\n3. Testing with sample transaction...');
  const sampleTransactions = [
    { description: 'Test NSF', amount: -35.00 },
    { description: 'Deposit', amount: 100.00 }
  ];
  
  const nsfCount = riskAnalysisService.calculateNSFCount(sampleTransactions);
  console.log('NSF Count:', nsfCount);
  
  const totals = riskAnalysisService.calculateTotalDepositsAndWithdrawals(sampleTransactions);
  console.log('Totals:', totals);
} catch (error) {
  console.error('Sample test error:', error.message);
}
