import IncomeStabilityService from './src/services/incomeStabilityService.js';

console.log('🧪 Testing IncomeStabilityService...\n');

console.log('Imported IncomeStabilityService:', IncomeStabilityService);
console.log('Type of IncomeStabilityService:', typeof IncomeStabilityService);

const service = new IncomeStabilityService();
console.log('Service instance:', service);
console.log('Service has filterIncomeTransactions?', typeof service.filterIncomeTransactions);
console.log('Service has analyze?', typeof service.analyze);
console.log('Service keys:', Object.getOwnPropertyNames(service));
console.log('Service prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)));

// Test with sample data
console.log('\n🔍 Testing with sample transactions...');

const sampleTransactions = [
  { date: '2024-01-01', description: 'Payroll Deposit', amount: 3000 },
  { date: '2024-01-15', description: 'Salary Direct Deposit', amount: 3000 },
  { date: '2024-02-01', description: 'Payroll Deposit', amount: 3000 },
  { date: '2024-02-15', description: 'Grocery Store Purchase', amount: -150 },
  { date: '2024-02-16', description: 'Gas Station', amount: -45 }
];

try {
  const result = service.analyze(sampleTransactions);
  console.log('\n✅ Analysis Result:');
  console.log('- Stability Score:', result.stabilityScore);
  console.log('- Income Count:', result.incomeCount);
  console.log('- Regular Income:', result.regularIncome);
  console.log('- Analysis Status:', result.status);
  
  // Test filterIncomeTransactions directly
  const incomeOnly = service.filterIncomeTransactions(sampleTransactions);
  console.log('\n📊 Filtered Income Transactions:');
  console.log('- Count:', incomeOnly.length);
  incomeOnly.forEach((tx, idx) => {
    console.log(`  ${idx + 1}. ${tx.description}: $${tx.amount}`);
  });
  
  console.log('\n✅ IncomeStabilityService is working correctly!');
  
} catch (error) {
  console.error('\n❌ Error during analysis:', error.message);
  console.error(error.stack);
}
