import PDFParserService from './src/services/pdfParserService.js';

// Test the PDF parser with sample bank statement text
async function testPDFParser() {
  const parser = new PDFParserService();
  
  // Sample bank statement text (you can replace this with your actual PDF text)
  const sampleBankStatementText = `
    CHECKING ACCOUNT STATEMENT
    Account Number: 1234567890
    Statement Period: 01/01/2024 - 01/31/2024
    
    Date        Description                     Amount      Balance
    01/02/2024  DIRECT DEPOSIT PAYROLL         2,500.00    5,250.00
    01/03/2024  ATM WITHDRAWAL                  -200.00    5,050.00
    01/05/2024  GROCERY STORE PURCHASE          -85.50     4,964.50
    01/08/2024  ONLINE TRANSFER                 -300.00    4,664.50
    01/10/2024  RESTAURANT CHARGE               -45.75     4,618.75
    01/15/2024  DIRECT DEPOSIT PAYROLL         2,500.00    7,118.75
    01/18/2024  UTILITY PAYMENT                -120.00     6,998.75
    01/22/2024  GAS STATION                     -55.30     6,943.45
    01/25/2024  INTEREST PAYMENT                 12.50     6,955.95
    01/28/2024  MONTHLY SERVICE FEE             -15.00     6,940.95
  `;

  console.log('Testing PDF Parser Service...\n');
  
  try {
    const transactions = parser.parseTransactions(sampleBankStatementText);
    
    console.log(`Found ${transactions.length} transactions:\n`);
    
    transactions.forEach((transaction, index) => {
      console.log(`Transaction ${index + 1}:`);
      console.log(`  Date: ${transaction.date?.toLocaleDateString() || 'Invalid Date'}`);
      console.log(`  Description: ${transaction.description}`);
      console.log(`  Amount: $${transaction.amount?.toFixed(2) || 'N/A'}`);
      console.log(`  Type: ${transaction.type}`);
      if (transaction.balance) {
        console.log(`  Balance: $${transaction.balance.toFixed(2)}`);
      }
      console.log('');
    });

    // Test with different date formats
    console.log('\n--- Testing different date formats ---\n');
    
    const alternativeFormats = `
      15/01/2024 ATM WITHDRAWAL -200.00
      2024-01-15 GROCERY STORE PURCHASE -85.50 1,234.50
      15.01.2024 ONLINE TRANSFER -300.00
      Jan 15 RESTAURANT CHARGE -45.75
      01/15    DIRECT DEPOSIT         2500.00     CR
      02/16    ATM FEE                   5.00     DR
    `;

    const altTransactions = parser.parseTransactions(alternativeFormats);
    console.log(`Found ${altTransactions.length} transactions with alternative formats:\n`);
    
    altTransactions.forEach((transaction, index) => {
      console.log(`Transaction ${index + 1}:`);
      console.log(`  Date: ${transaction.date?.toLocaleDateString() || 'Invalid Date'}`);
      console.log(`  Description: ${transaction.description}`);
      console.log(`  Amount: $${transaction.amount?.toFixed(2) || 'N/A'}`);
      console.log(`  Type: ${transaction.type}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error testing PDF parser:', error);
  }
}

// Run the test
testPDFParser();
