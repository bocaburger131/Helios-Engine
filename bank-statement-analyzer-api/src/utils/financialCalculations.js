class FinancialCalculations {
    /**
     * Calculates Debt Service Coverage Ratio (DSCR)
     * @param {number} netOperatingIncome - NOI from the period
     * @param {number} totalDebtService - Total debt payments
     * @returns {number} - DSCR value
     */
    static calculateDSCR(netOperatingIncome, totalDebtService) {
        return netOperatingIncome / totalDebtService;
    }

    /**
     * Calculates Working Capital Ratio
     * @param {number} currentAssets - Current assets value
     * @param {number} currentLiabilities - Current liabilities value
     * @returns {number} - Working Capital Ratio
     */
    static calculateWorkingCapitalRatio(currentAssets, currentLiabilities) {
        return currentAssets / currentLiabilities;
    }

    /**
     * Calculates Global Debt Service Coverage Ratio
     * @param {Object} businessFinancials - Business financial data
     * @param {Object} personalFinancials - Personal financial data
     * @returns {number} - Global DSCR
     */
    static calculateGlobalDSCR(businessFinancials, personalFinancials) {
        const totalIncome = businessFinancials.netIncome + personalFinancials.netIncome;
        const totalDebt = businessFinancials.debtService + personalFinancials.debtService;
        return totalIncome / totalDebt;
    }
}