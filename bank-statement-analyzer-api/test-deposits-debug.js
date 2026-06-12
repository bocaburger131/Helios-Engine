import PDFParserService from './src/services/pdfParserService.js';

const testData = `DEPOSITS AND ADDITIONS
04/01 Remote Online Deposit 1 $1,827.15
04/01 Remote Online Deposit 1 154.00
04/01 Payment Received 04/01 Ondeck 888-269-4246 Visa Direct NY Card 9109 2,500.00
04/01 Zelle Payment From Prudent Estates L.L.C. Pncaa0Qyl60J 1,000.00
04/02 Orig CO Name:Columbus Metro. Orig ID:7316401164 Desc Date:250401 CO Entry
Descr:Payment Sec:CCD Trace#:042000014008466 Eed:250402 Ind ID:L203485
Ind Name:Walters Michael G Remit000000000913041 L203485 Trn:
0924008466Tc
1,892.00
04/11 Fedwire Credit Via: Firstbank/107005047 B/O: Rolla Boys, L.L.C. Centennial CO
80122-1522 Ref: Chase Nyc/Ctr/Bnf=Prudent Estates L.L.C. Pickerington OH 43147-8327
US/Ac-000000008859 Rfb=O/B Firstbk Ob I=1461 And 1467 Mount Vernon Ave., DR Aw
No 3 For Renovation Imad: 0411Qmgft006001518 Trn: 1349911101Ff
15,000.00
CHECKS PAID`;

const parser = new PDFParserService();

console.log('Testing deposits section with multi-line transactions...');
console.log('='.repeat(60));

const lines = testData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
console.log('Lines:');
lines.forEach((line, index) => {
  console.log(`${index}: "${line}"`);
});

console.log('\n' + '='.repeat(60));

const transactions = parser.parseDepositsAndAdditions(lines);

console.log(`Found ${transactions.length} transactions:`);
transactions.forEach((transaction, index) => {
  console.log(`${index + 1}. ${transaction.date} | ${transaction.type.toUpperCase()} | $${transaction.amount.toFixed(2)} | ${transaction.description.substring(0, 80)}...`);
});
