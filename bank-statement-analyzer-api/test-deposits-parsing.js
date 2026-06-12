import PDFParserService from './src/services/pdfParserService.js';

// Extract just the deposits section from the statement
const depositsSection = `04/01 Remote Online Deposit 1 $1,827.15
04/01 Remote Online Deposit 1 154.00
04/01 Payment Received 04/01 Ondeck 888-269-4246 Visa Direct NY Card 9109 2,500.00
04/01 Zelle Payment From Prudent Estates L.L.C. Pncaa0Qyl60J 1,000.00
04/01 Zelle Payment From Flavio Moreno Espinosa H50245642580 950.00
04/01 Zelle Payment From Abdenbi Ouanane Bacn6Zfr7Ot7 950.00
04/01 Zelle Payment From Kimberly Endicott H50245625173 750.00
04/01 Zelle Payment From Christy L Baker Key0Dbi13Gsy 750.00
04/02 Payment Received 04/02 Cash App*Pruden Estate Oakland CA Card 9109 2,402.34
04/02 Orig CO Name:Columbus Metro. Orig ID:7316401164 Desc Date:250401 CO Entry
Descr:Payment Sec:CCD Trace#:042000014008466 Eed:250402 Ind ID:L203485
Ind Name:Walters Michael G Remit000000000913041 L203485 Trn:
0924008466Tc
1,892.00
04/02 Zelle Payment From Prudent Estates L.L.C. Pncaa0Qze59N 1,415.00
04/02 Orig CO Name:Springfield Metr Orig ID:1310652158 Desc Date:Apr 25 CO Entry
Descr:Payments Sec:PPD Trace#:041001034254293 Eed:250402 Ind ID:
Ind Name:Prudent Estates LLC Trn: 0924254293Tc
1,207.00
04/02 Zelle Payment From Inessa W Koehler 24267025104 950.00
04/02 Orig CO Name:Springfield Metr Orig ID:1310652158 Desc Date:Apr 25 CO Entry
Descr:Payments Sec:PPD Trace#:041001034254291 Eed:250402 Ind ID:
Ind Name:Michael Walters Trn: 0924254291Tc
520.00
04/03 Deposit 1251264090 850.00
04/03 Zelle Payment From Vanel Gedeon Ftb103293829 1,000.00
04/03 Zelle Payment From Odulon Belly Ftb103344031 1,000.00
04/03 Zelle Payment From Sommer Farris Ftb103324294 950.00
04/03 Zelle Payment From Valenn LLC Pncaa0Rao87S 900.00
04/04 Zelle Payment From Prudent Estates L.L.C. Pncaa0Rbw57I 1,150.00
04/04 Payment Received 04/04 Chime San Francisco CA Card 9109 950.00
04/04 Zelle Payment From Vanel Gedeon Ftb103399879 200.00
04/07 Payment Received 04/07 Cash App*Pruden Estate Oakland CA Card 9109 1,480.00
04/07 Payment Received 04/07 Cash App*Pruden Estate Oakland CA Card 9109 800.00
04/07 Zelle Payment From Gladys Thomas Coffhpmnwlty 255.75
04/07 Zelle Payment From Flavio Moreno Espinosa H50246157265 91.84
04/08 Zelle Payment From Prudent Estates L.L.C. Pncaa0Rgt18M 1,200.00
04/08 Payment Received 04/08 Cash App*Pruden Estate Oakland CA Card 9109 900.00
04/08 Payment Received 04/08 Cash App*Pruden Estate Oakland CA Card 9109 206.00
04/11 Fedwire Credit Via: Firstbank/107005047 B/O: Rolla Boys, L.L.C. Centennial CO
80122-1522 Ref: Chase Nyc/Ctr/Bnf=Prudent Estates L.L.C. Pickerington OH 43147-8327
US/Ac-000000008859 Rfb=O/B Firstbk Ob I=1461 And 1467 Mount Vernon Ave., DR Aw
No 3 For Renovation Imad: 0411Qmgft006001518 Trn: 1349911101Ff
15,000.00
04/11 Zelle Payment From Gladys Thomas Cofrduuxala3 211.75
04/11 Zelle Payment From Gladys Thomas Cof19Derl8VA 44.00
04/15 Zelle Payment From Ronald Toussaint 24430629896 875.00
04/17 Zelle Payment From Gladys Thomas Cof4Gcfv6B66 255.75
04/17 Zelle Payment From Inessa W Koehler 24451085208 157.97
04/18 Zelle Payment From Sommer Farris Ftb104599483 100.00
04/21 Zelle Payment From Abdenbi Ouanane Bacq26Vd5Z1D 137.97
04/21 Payment Received 04/19 Chime San Francisco CA Card 9109 100.00
04/22 Zelle Payment From Inessa W Koehler 24504286403 193.52
04/24 Online Transfer From Mma ...2991 Transaction#: 24522374049 600.00`;

const parser = new PDFParserService();

console.log('Testing just the deposits section parsing...');
console.log('='.repeat(60));

// Test each line individually
const lines = depositsSection.split('\n').map(line => line.trim()).filter(line => line.length > 0);

console.log(`Processing ${lines.length} lines from deposits section:`);
console.log('='.repeat(60));

let parsedCount = 0;
lines.forEach((line, index) => {
  console.log(`Line ${index + 1}: "${line}"`);
  
  const transaction = parser.parseChaseTransactionLine(line, 'credit');
  if (transaction) {
    parsedCount++;
    console.log(`  ✓ PARSED: ${transaction.date} | $${transaction.amount} | ${transaction.description.substring(0, 50)}...`);
  } else {
    console.log(`  ✗ FAILED TO PARSE`);
  }
  console.log('');
});

console.log('='.repeat(60));
console.log(`Successfully parsed ${parsedCount} out of ${lines.length} lines`);

// Test the regex pattern directly
console.log('\nTesting regex pattern:');
const chasePattern = /^(\d{2}\/\d{2})\s+(.+?)\s+\$?([\d,]+\.?\d{0,2})$/;
const testLine = "04/01 Remote Online Deposit 1 $1,827.15";
const match = testLine.match(chasePattern);
console.log(`Test line: "${testLine}"`);
console.log(`Match result:`, match);
