import pdfParse from 'pdf-parse';

export class BaseBankStatementParser {
    async parse(buffer) {
        const pdfData = await pdfParse(buffer);
        return {
            accountInfo: await this._extractAccountInfo(pdfData.text),
            transactions: await this._extractTransactions(pdfData.text),
            metadata: {
                pageCount: pdfData.numpages,
                bankName: this.bankName
            }
        };
    }

    // Abstract methods to be implemented by specific bank parsers
    async _extractAccountInfo(text) {
        throw new Error('_extractAccountInfo must be implemented');
    }

    async _extractTransactions(text) {
        throw new Error('_extractTransactions must be implemented');
    }
}