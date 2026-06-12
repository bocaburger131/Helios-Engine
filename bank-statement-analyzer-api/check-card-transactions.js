const sampleText = `ATM & DEBIT CARD WITHDRAWALS
04/01 Payment Sent 03/31 Cash App*Pruden Estates Oakland CA Card 9109 $200.00
04/01 Card Purchase 03/31 Rocky's Ace Hardware Springfield OH Card 9109 25.71
04/01 Card Purchase With Pin 04/01 Speedway Springfield OH Card 9109 43.94
04/03 Card Purchase With Pin 04/03 Lowe's #453 Springfield OH Card 9109 165.59
04/03 Card Purchase With Pin 04/03 United Dairy Farmers Columbus OH Card 9109 45.99
04/04 Card Purchase With Pin 04/04 Lowe's #453 Springfield OH Card 9109 39.33
04/07 Card Purchase 04/04 Panda Express #3581 Springfield OH Card 9109 13.43
04/07 Card Purchase 04/05 Sq *Ntag Ohio River Val Gosq.Com OH Card 9109 120.00
04/07 Card Purchase With Pin 04/05 Drivetime 14202 Columbus OH Card 9109 1,000.00
04/07 Card Purchase 04/07 City of Springfield O 937-324-7700 OH Card 9109 497.01
04/07 Card Purchase 04/07 City of Springfield O 937-324-7700 OH Card 9109 437.53
04/07 Card Purchase 04/07 City of Springfield O 937-324-7700 OH Card 9109 369.02
04/07 Card Purchase 04/07 City of Springfield O 937-324-7700 OH Card 9109 133.53
04/07 Card Purchase With Pin 04/07 Marathon Petro12 Springfield OH Card 9109 52.17
04/09 Card Purchase 04/08 Amazon.Com*Jd3A201J3 Amzn.Com/Bill WA Card 9109 25.71
04/09 Card Purchase 04/08 Reipro LLC 800-6391918 GA Card 9109 109.00
04/10 Card Purchase With Pin 04/10 Speedway Springfield OH Card 9109 46.37
04/14 Card Purchase 04/13 City of Springfield O 937-324-7700 OH Card 9109 408.41
04/18 Card Purchase With Pin 04/18 The Home Depot #3867 Springfield OH Card 9109 51.83
04/18 Card Purchase With Pin 04/18 United Dairy Farmers Columbus OH Card 9109 50.28
04/21 Card Purchase 04/19 City of Springfield O 937-324-7700 OH Card 9109 162.88
04/21 Card Purchase With Pin 04/19 Speedway Springfield OH Card 9109 31.34
04/21 Card Purchase With Pin 04/20 Saraga Hamilton Columbus OH Card 9109 80.46
04/23 Card Purchase 04/23 Ipostal*Renewal Ipostal1.Com NY Card 9109 34.99
04/25 Card Purchase With Pin 04/25 United Dairy Farmers Columbus OH Card 9109 45.24
04/28 Payment Sent 04/26 Cash App*Pruden Estates Oakland CA Card 9109 300.00
04/28 Card Purchase With Pin 04/26 United Dairy Farmers Columbus OH Card 9109 19.78
04/29 Card Purchase 04/28 Ipostal*Consolidateit Ipostal1.Com NY Card 9109 1.95
04/29 Card Purchase 04/28 Ipostal*Shipitems Ipostal1.Com NY Card 9109 2.92
04/30 Card Purchase With Pin 04/30 United Dairy Farmers Columbus OH Card 9109 50.47
Total ATM Withdrawals & Debits $0.00
Total Card Purchases $4,564.88`;

console.log('Checking how many card transactions appear in the ATM section...');

const lines = sampleText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
let cardTransactions = 0;

lines.forEach(line => {
  if (line.match(/^\d{2}\/\d{2}/) && (line.includes('Card Purchase') || line.includes('Payment Sent'))) {
    cardTransactions++;
    console.log(`Card transaction: ${line}`);
  }
});

console.log(`\nTotal card transactions in ATM section: ${cardTransactions}`);
console.log('These should all be parsed as debits!');
