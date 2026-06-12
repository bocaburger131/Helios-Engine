import PDFParserService from './src/services/pdfParserService.js';

// Create a custom version of the parser with debug output
class DebugPDFParserService extends PDFParserService {
  parseDepositsAndAdditions(lines) {
    const transactions = [];
    let inSection = false;
    let multiLineTransaction = null;
    
    console.log('Starting parseDepositsAndAdditions...');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      console.log(`\nLine ${i}: "${line}"`);
      
      // Start of deposits section
      if (line.includes('DEPOSITS AND ADDITIONS')) {
        inSection = true;
        console.log('  ✓ Entered deposits section');
        continue;
      }
      
      // End of deposits section
      if (inSection && (line.includes('Total Deposits and Additions') || 
                       line.includes('CHECKS PAID') ||
                       line.includes('ATM & DEBIT CARD') ||
                       line.includes('ELECTRONIC WITHDRAWALS') ||
                       line.includes('FEES'))) {
        console.log('  ✓ End of deposits section detected');
        // Process any pending multi-line transaction
        if (multiLineTransaction) {
          console.log('  ✓ Processing pending multi-line transaction:', multiLineTransaction.description.substring(0, 50));
          multiLineTransaction.category = this.categorizeTransaction(multiLineTransaction.description, 'credit');
          transactions.push(multiLineTransaction);
          multiLineTransaction = null;
        }
        break;
      }
      
      if (inSection) {
        console.log('  Processing line in deposits section...');
        // Try to parse the line as a complete transaction
        const transaction = this.parseChaseTransactionLine(line, 'credit');
        if (transaction) {
          console.log('  ✓ Parsed complete transaction:', transaction.description.substring(0, 50));
          // If we have a pending multi-line transaction, process it first
          if (multiLineTransaction) {
            console.log('  ✓ Processing previous pending transaction first');
            multiLineTransaction.category = this.categorizeTransaction(multiLineTransaction.description, 'credit');
            transactions.push(multiLineTransaction);
          }
          
          transaction.category = this.categorizeTransaction(transaction.description, 'credit');
          transactions.push(transaction);
          multiLineTransaction = null;
        } else {
          console.log('  Line not a complete transaction, checking for multi-line start...');
          // Check if this line starts a multi-line transaction
          const dateMatch = line.match(/^(\d{2}\/\d{2})\s+(.+)/);
          if (dateMatch && !multiLineTransaction) {
            console.log('  ✓ Starting new multi-line transaction');
            // Start of a new multi-line transaction
            const dateStr = dateMatch[1];
            const description = dateMatch[2].trim();
            
            // Look ahead for the amount on subsequent lines
            let amount = null;
            let fullDescription = description;
            
            for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
              const nextLine = lines[j].trim();
              console.log(`    Looking ahead at line ${j}: "${nextLine}"`);
              
              // Check if this line contains just an amount
              const amountMatch = nextLine.match(/^[\d,]+\.?\d{0,2}$/);
              if (amountMatch) {
                amount = parseFloat(amountMatch[0].replace(/,/g, ''));
                console.log(`    ✓ Found amount: ${amount}`);
                i = j; // Skip the processed lines
                break;
              }
              
              // If it's not an amount and doesn't start with a date, add to description
              if (!nextLine.match(/^\d{2}\/\d{2}/) && nextLine.length > 0 && !nextLine.includes('CHECKS PAID')) {
                fullDescription += ' ' + nextLine;
                console.log(`    Adding to description: "${nextLine}"`);
              } else {
                console.log(`    Stopping description build at: "${nextLine}"`);
                break;
              }
            }
            
            if (amount !== null) {
              console.log(`  ✓ Created multi-line transaction: $${amount} - ${fullDescription.substring(0, 50)}`);
              // Create the transaction
              const currentYear = this.extractYearFromStatement() || new Date().getFullYear();
              const [month, day] = dateStr.split('/').map(num => parseInt(num));
              const date = new Date(currentYear, month - 1, day);
              
              multiLineTransaction = {
                date: date.toISOString().split('T')[0],
                description: this.cleanDescription(fullDescription),
                amount: amount,
                balance: null,
                type: 'credit',
                category: null // Will be set when we process it
              };
            }
          }
        }
      }
    }
    
    // Process any remaining multi-line transaction
    if (multiLineTransaction) {
      console.log('Final: Processing remaining multi-line transaction');
      multiLineTransaction.category = this.categorizeTransaction(multiLineTransaction.description, 'credit');
      transactions.push(multiLineTransaction);
    }
    
    console.log(`\nFinal result: ${transactions.length} transactions found`);
    return transactions;
  }
}

const testData = `DEPOSITS AND ADDITIONS
04/01 Remote Online Deposit 1 $1,827.15
04/11 Fedwire Credit Via: Firstbank/107005047 B/O: Rolla Boys, L.L.C. Centennial CO
80122-1522 Ref: Chase Nyc/Ctr/Bnf=Prudent Estates L.L.C. Pickerington OH 43147-8327
US/Ac-000000008859 Rfb=O/B Firstbk Ob I=1461 And 1467 Mount Vernon Ave., DR Aw
No 3 For Renovation Imad: 0411Qmgft006001518 Trn: 1349911101Ff
15,000.00
CHECKS PAID`;

const parser = new DebugPDFParserService();

console.log('Testing deposits section with debug output...');
console.log('='.repeat(60));

const lines = testData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
const transactions = parser.parseDepositsAndAdditions(lines);

console.log('\n' + '='.repeat(60));
console.log(`Found ${transactions.length} transactions:`);
transactions.forEach((transaction, index) => {
  console.log(`${index + 1}. ${transaction.date} | ${transaction.type.toUpperCase()} | $${transaction.amount.toFixed(2)} | ${transaction.description}`);
});
