import { BaseBankStatementParser } from './BaseBankStatementParser.js';

export class ChaseBankParser extends BaseBankStatementParser {
    constructor() {
        super();
        this.bankName = 'Chase';
    }

    async _extractAccountInfo(text) {
        const accountMatch = text.match(/Account Number:\s*([*\d]+)/);
        const periodMatch = text.match(/Statement Period:\s*([\d\/]+)\s*through\s*([\d\/]+)/);

        return {
            accountNumber: accountMatch?.[1] || '',
            period: {
                start: periodMatch?.[1] || '',
                end: periodMatch?.[2] || ''
            }
        };
    }

    async _extractTransactions(text) {
        const transactions = [];
        const lines = text.split('\n');
        
        // Chase specific transaction pattern
        const txPattern = /(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.+?)\s+([-+]?\$[\d,]+\.\d{2})\s+([-+]?\$[\d,]+\.\d{2})/;

        for (const line of lines) {
            const match = line.match(txPattern);
            if (match) {
                transactions.push({
                    date: match[1],
                    postDate: match[2],
                    description: match[3].trim(),
                    amount: this._parseAmount(match[4]),
                    balance: this._parseAmount(match[5])
                });
            }
        }

        return transactions;
    }

    _parseAmount(amountStr) {
        return parseFloat(amountStr.replace(/[$,]/g, ''));
    }
}