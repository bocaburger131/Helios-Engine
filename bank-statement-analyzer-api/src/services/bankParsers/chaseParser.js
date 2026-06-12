class ChaseParser {
  parseStatement(text, statement) {
    const transactions = [];
    const lines = text.split('\n');
    
    let inTransactionSection = false;
    let currentBalance = 0;
    
    for (const line of lines) {
      // Detect transaction section
      if (line.includes('Transaction Detail') || line.includes('TRANSACTION DETAIL')) {
        inTransactionSection = true;
        continue;
      }
      
      if (!inTransactionSection) continue;
      
      // Chase format: MM/DD Description Amount Balance
      const pattern = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s+(\$?[\d,]+\.\d{2})$/;
      const match = line.trim().match(pattern);
      
      if (match) {
        const [_, date, description, amount, balance] = match;
        const year = this.extractYear(text, date);
        const fullDate = new Date(`${date}/${year}`);
        const amountValue = this.parseAmount(amount);
        
        transactions.push({
          date: fullDate,
          description: description.trim(),
          amount: amountValue,
          type: amountValue >= 0 ? 'credit' : 'debit',
          balance: this.parseAmount(balance),
          category: 'Uncategorized',
          metadata: {
            bank: 'chase',
            originalLine: line
          }
        });
      }
    }
    
    return transactions;
  }
  
  parseAmount(amountStr) {
    return parseFloat(amountStr.replace(/[$,]/g, ''));
  }
  
  extractYear(text, monthDay) {
    // Try to find statement period
    const periodMatch = text.match(/Statement Period:?\s*(\w+\s+\d+,?\s+\d{4})/i);
    if (periodMatch) {
      const year = periodMatch[1].match(/\d{4}/)[0];
      return year;
    }
    
    // Default to current year
    return new Date().getFullYear();
  }
}

export default new ChaseParser();