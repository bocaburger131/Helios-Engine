class WellsFargoParser {
    constructor() {
        this.bankName = 'Wells Fargo';
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

module.exports = WellsFargoParser;