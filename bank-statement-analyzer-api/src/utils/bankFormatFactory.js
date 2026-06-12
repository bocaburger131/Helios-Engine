class BankFormatFactory {
    static getParser(bankType) {
        switch (bankType.toLowerCase()) {
        case 'chase':
            return require('../parsers/chaseParser');
        case 'boa':
            return require('../parsers/boaParser');
        case 'wellsfargo':
            return require('../parsers/wellsFargoParser');
        default:
            throw new Error('Unsupported bank format');
        }
    }
}

module.exports = BankFormatFactory;