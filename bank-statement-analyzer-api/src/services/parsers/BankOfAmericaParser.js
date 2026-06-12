import { BaseBankStatementParser } from './BaseBankStatementParser.js';

export class BankOfAmericaParser extends BaseBankStatementParser {
    constructor() {
        super();
        this.bankName = 'Bank of America';
    }

    async _extractAccountInfo(text) {
        const accountMatch = text.match(/Account number:\s*(\d{4})/);
        const periodMatch = text.match(/Statement period:\s*([\w\s,]+)/i);

        return {
            accountNumber: accountMatch?.[1] || '',
            period: periodMatch?.[1] || ''
        };
    }

    async _extractTransactions(text) {
        const transactions = [];
        const lines = text.split('\n');
        
        // BofA specific transaction pattern
        const txPattern = /(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([-+]?\d{1,3}(?:,\d{3})*\.\d{2})/;

        for (const line of lines) {
            const match = line.match(txPattern);
            if (match) {
                transactions.push({
                    date: match[1],
                    description: match[2].trim(),
                    amount: this._parseAmount(match[3])
                });
            }
        }

        return transactions;
    }

    _parseAmount(amountStr) {
        return parseFloat(amountStr.replace(/,/g, ''));
    }
}