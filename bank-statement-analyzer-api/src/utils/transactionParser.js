import { AppError } from './appError.js';

class TransactionParser {
  constructor() {
    this.transactionPatterns = {
      date: /(\d{2}\/\d{2})/g,
      amount: /\$?([\d,]+\.\d{2})/g,
      description: /^(\d{2}\/\d{2})\s+(.+?)\s+\$?([\d,]+\.\d{2})$/gm
    };
  }

  parseStatement(statementText) {
    try {
      const transactions = [];
      const lines = statementText.split('\n');
      let currentSection = null;
      let accountInfo = this.extractAccountInfo(statementText);
      let balances = this.extractBalances(statementText);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (this.isSectionHeader(line)) {
          currentSection = this.getSectionType(line);
          continue;
        }

        if (currentSection && this.isTransactionLine(line)) {
          const transaction = this.parseTransactionLine(line, currentSection);
          if (transaction) {
            transactions.push(transaction);
          }
        }
      }

      return {
        accountInfo,
        balances,
        transactions,
        summary: this.generateSummary(transactions)
      };
    } catch (error) {
      throw new AppError('Failed to parse statement', 422);
    }
  }

  extractAccountInfo(text) {
    const accountNumberMatch = text.match(/Account Number:\s*(\d+)/i);
    const statementPeriodMatch = text.match(/(\w+\s+\d{2},\s+\d{4})\s+through\s+(\w+\s+\d{2},\s+\d{4})/i);
    const bankNameMatch = text.match(/(JPMorgan Chase Bank|Chase)/i);
    const accountHolderMatch = text.match(/([A-Z\s]+L\.L\.C\.|[A-Z\s]+LLC)/);

    return {
      accountNumber: accountNumberMatch ? accountNumberMatch[1] : null,
      statementPeriod: statementPeriodMatch ? {
        from: statementPeriodMatch[1],
        to: statementPeriodMatch[2]
      } : null,
      bankName: bankNameMatch ? bankNameMatch[1] : null,
      accountHolder: accountHolderMatch ? accountHolderMatch[1].trim() : null
    };
  }

  extractBalances(text) {
    const beginningBalanceMatch = text.match(/Beginning Balance\s+\$?([\d,]+\.\d{2})/i);
    const endingBalanceMatch = text.match(/Ending Balance\s+\d*\s+\$?([\d,]+\.\d{2})/i);

    return {
      beginning: beginningBalanceMatch ? parseFloat(beginningBalanceMatch[1].replace(/,/g, '')) : null,
      ending: endingBalanceMatch ? parseFloat(endingBalanceMatch[1].replace(/,/g, '')) : null
    };
  }

  isSectionHeader(line) {
    const sectionHeaders = [
      'DEPOSITS AND ADDITIONS',
      'ATM & DEBIT CARD WITHDRAWALS',
      'ELECTRONIC WITHDRAWALS',
      'FEES'
    ];
    return sectionHeaders.some(header => line.includes(header));
  }

  getSectionType(line) {
    if (line.includes('DEPOSITS AND ADDITIONS')) return 'deposits';
    if (line.includes('ATM & DEBIT CARD WITHDRAWALS')) return 'withdrawals';
    if (line.includes('ELECTRONIC WITHDRAWALS')) return 'electronic';
    if (line.includes('FEES')) return 'fees';
    return null;
  }

  isTransactionLine(line) {
    // Check if line starts with date pattern MM/DD
    return /^\d{2}\/\d{2}/.test(line) && line.includes('$');
  }

  parseTransactionLine(line, section) {
    const dateMatch = line.match(/^(\d{2}\/\d{2})/);
    const amountMatch = line.match(/\$?([\d,]+\.\d{2})$/);
    
    if (!dateMatch || !amountMatch) return null;

    const date = dateMatch[1];
    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const description = line.substring(date.length, line.lastIndexOf(amountMatch[0])).trim();

    return {
      date,
      description,
      amount: section === 'deposits' ? amount : -amount,
      type: section,
      category: this.categorizeTransaction(description, section)
    };
  }

  categorizeTransaction(description, section) {
    const categories = {
      deposits: {
        'Zelle Payment': /zelle payment/i,
        'Cash App': /cash app/i,
        'Remote Deposit': /remote.*deposit/i,
        'ATM Deposit': /atm.*deposit/i,
        'ACH Credit': /orig co name/i,
        'Card Return': /card purchase return/i
      },
      withdrawals: {
        'Card Purchase': /card purchase/i,
        'ATM Withdrawal': /atm/i,
        'Payment Sent': /payment sent/i
      },
      electronic: {
        'Zelle Payment': /zelle payment/i,
        'Online Transfer': /online transfer/i,
        'ACH Payment': /orig co name/i,
        'Mortgage Payment': /mortgage|mtg/i,
        'Credit Card Payment': /credit.*card|cardmember/i,
        'Utility Payment': /waste management|electric|gas/i
      },
      fees: {
        'Service Fee': /service fee/i,
        'ACH Fee': /ach.*fee/i,
        'Overdraft Fee': /overdraft/i
      }
    };

    const sectionCategories = categories[section] || {};
    
    for (const [category, pattern] of Object.entries(sectionCategories)) {
      if (pattern.test(description)) {
        return category;
      }
    }

    return 'Other';
  }

  generateSummary(transactions) {
    const summary = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalFees: 0,
      transactionCount: transactions.length,
      categories: {}
    };

    transactions.forEach(transaction => {
      if (transaction.amount > 0) {
        summary.totalDeposits += transaction.amount;
      } else {
        summary.totalWithdrawals += Math.abs(transaction.amount);
      }

      if (transaction.type === 'fees') {
        summary.totalFees += Math.abs(transaction.amount);
      }

      // Category summary
      if (!summary.categories[transaction.category]) {
        summary.categories[transaction.category] = {
          count: 0,
          total: 0
        };
      }
      summary.categories[transaction.category].count++;
      summary.categories[transaction.category].total += Math.abs(transaction.amount);
    });

    return summary;
  }
}

export default new TransactionParser();