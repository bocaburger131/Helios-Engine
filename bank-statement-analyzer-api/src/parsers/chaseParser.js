class ChaseParser {
    constructor() {
        this.bankName = 'Chase';
    }

    async parse(pdfBuffer) {
        return {
            transactions: [],
            metadata: {
                bank: this.bankName,
                dateProcessed: new Date()
            }
        };
    }
}

module.exports = ChaseParser;