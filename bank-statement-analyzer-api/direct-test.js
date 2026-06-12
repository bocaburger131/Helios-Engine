// Direct test of the function without vitest
console.log('Direct function test...');

// Import the actual function
const serviceModule = await import('./src/services/riskAnalysisService.js');
const service = serviceModule.default;

console.log('Service object:', service);
console.log('Function type:', typeof service.calculateTotalDepositsAndWithdrawals);

// Test the function directly
const testTransactions = [
  { amount: 100 },
  { amount: -50 }
];

console.log('Testing with:', testTransactions);

try {
  const result = service.calculateTotalDepositsAndWithdrawals(testTransactions);
  console.log('Direct result:', result);
  
  // Manual calculation
  let manualDeposits = 0;
  let manualWithdrawals = 0;
  
  testTransactions.forEach(transaction => {
    console.log('Processing transaction:', transaction);
    if (transaction && typeof transaction.amount === 'number') {
      console.log('  Valid transaction, amount:', transaction.amount, 'type:', typeof transaction.amount);
      if (transaction.amount > 0) {
        console.log('  Adding to deposits:', transaction.amount);
        manualDeposits += transaction.amount;
      } else if (transaction.amount < 0) {
        console.log('  Adding to withdrawals:', Math.abs(transaction.amount));
        manualWithdrawals += Math.abs(transaction.amount);
      }
    }
  });
  
  console.log('Manual calculation - Deposits:', manualDeposits, 'Withdrawals:', manualWithdrawals);
  
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
