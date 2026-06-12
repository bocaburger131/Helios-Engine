import PDFParserService from './src/services/pdfParserService.js';

const testData = `04/11 Fedwire Credit Via: Firstbank/107005047 B/O: Rolla Boys, L.L.C. Centennial CO
80122-1522 Ref: Chase Nyc/Ctr/Bnf=Prudent Estates L.L.C. Pickerington OH 43147-8327
US/Ac-000000008859 Rfb=O/B Firstbk Ob I=1461 And 1467 Mount Vernon Ave., DR Aw
No 3 For Renovation Imad: 0411Qmgft006001518 Trn: 1349911101Ff
15,000.00`;

const parser = new PDFParserService();

console.log('Testing Fedwire multi-line transaction...');
console.log('='.repeat(60));

const lines = testData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
console.log('Lines:');
lines.forEach((line, index) => {
  console.log(`${index}: "${line}"`);
});

console.log('\nChecking date pattern:');
const dateMatch = lines[0].match(/^(\d{2}\/\d{2})\s+(.+)/);
console.log('Date match:', dateMatch);

console.log('\nLooking for amount pattern in subsequent lines:');
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const amountMatch = line.match(/^[\d,]+\.?\d{0,2}$/);
  console.log(`Line ${i}: "${line}" -> Amount match:`, amountMatch);
}
