import { ZohoBaseService } from './zohoBaseService.js';

export class ZohoSheetsService extends ZohoBaseService {
    constructor() {
        super();
        this.baseUrl = 'https://sheet.zoho.com/api/v2';
        this.maxRetries = 3;
    }

    async exportAnalysis(analysis) {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                const endpoint = `${this.baseUrl}/spreadsheets`;
                const data = this._formatTransactions(analysis.transactions);
                
                const response = await this.client.post(endpoint, {
                    data: data
                });

                return this.handleResponse(response);
            } catch (error) {
                retries++;
                if (retries === this.maxRetries) {
                    throw error;
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
            }
        }
    }

    _formatTransactions(transactions) {
        return transactions.map(t => ({
            Date: t.date,
            Description: t.description,
            Amount: t.amount,
            Category: t.category
        }));
    }
}