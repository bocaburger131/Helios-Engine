const riskAnalysisService = {
  calculateAverageDailyBalance(transactions, openingBalance) {
    console.log('=== Debug Info ===');
    console.log('arguments.length:', arguments.length);
    console.log('openingBalance:', openingBalance);
    console.log('typeof openingBalance:', typeof openingBalance);
    console.log('openingBalance === undefined:', openingBalance === undefined);
    console.log('openingBalance === null:', openingBalance === null);
    console.log('isNaN(openingBalance):', isNaN(openingBalance));
    
    // Handle default value manually to detect when undefined is explicitly passed
    let hasOpeningBalance = arguments.length > 1;
    
    if (hasOpeningBalance) {
      console.log('Has opening balance, checking validation...');
      // Input validation for openingBalance when explicitly passed (as requested)
      if (openingBalance === null || 
          openingBalance === undefined || 
          typeof openingBalance !== 'number' || 
          isNaN(openingBalance)) {
        console.log('Should throw error!');
        throw new Error('Opening balance must be a number');
      }
    } else {
      // Use default value when not provided
      openingBalance = 0;
    }
    
    return { averageDailyBalance: openingBalance, periodDays: 1 };
  }
};

try {
  console.log('Calling with undefined...');
  const result = riskAnalysisService.calculateAverageDailyBalance([], undefined);
  console.log('ERROR: No exception thrown! Result:', result);
} catch (error) {
  console.log('SUCCESS: Exception thrown:', error.message);
}
