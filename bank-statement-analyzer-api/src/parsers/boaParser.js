class BOAParser {
    constructor() {
        this.bankName = 'Bank of America';
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

// Export the class, not an instance
module.exports = BOAParser;