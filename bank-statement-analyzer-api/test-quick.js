import pdfParser from './src/services/pdfParser.js';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';
import Merchant from './src/models/Merchant.js';

async function quickTest() {
  console.log(' Quick Functionality Test\n');
  
  try {
    // Test 1: Merchant normalization
    console.log('1 Testing Merchant.normalizeName:');
    const names = ['STARBUCKS #12345', 'Amazon.com*123', 'UBER *TRIP'];
    names.forEach(name => {
      const normalized = Merchant.normalizeName(name);
      console.log(`   ${name} ? ${normalized}`);
    });
    
    // Test 2: PDF date parsing
    console.log('\n2 Testing date parsing:');
    const parser = new pdfParser.constructor();
    const dates = ['01/15/2024', '15-01-2024', 'Jan 15, 2024'];
    dates.forEach(dateStr => {
      try {
        const parsed = parser.parseDate(dateStr);
        console.log(`    ${dateStr}  ${parsed.toLocaleDateString()}`);
      } catch (e) {
        console.log(`    ${dateStr}  Error: ${e.message}`);
      }
    });
    
    // Test 3: Transaction type detection
    console.log('\n3 Testing transaction type detection:');
    const transactions = [
      { desc: 'DIRECT DEPOSIT', amount: '1000' },
      { desc: 'STARBUCKS', amount: '5.75' },
      { desc: 'REFUND', amount: '(50.00)' }
    ];
    transactions.forEach(({ desc, amount }) => {
      const type = parser.detectTransactionType(desc, amount);
      console.log(`   ${desc} ($${amount})  ${type}`);
    });
    
    console.log('\n Quick test completed!');
    
  } catch (error) {
    console.error(' Quick test failed:', error);
  }
}

quickTest();
