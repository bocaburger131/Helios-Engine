/**
 * @fileoverview Commercial Finance Compliance Standards
 * 
 * Key Regulatory Requirements:
 * 1. CLFP (Certified Lease & Finance Professional)
 *    - Minimum DSCR: 1.25x
 *    - Working Capital Ratio: > 1.5x
 *    - Documentation Requirements
 * 
 * 2. ELFA (Equipment Leasing and Finance Association)
 *    - Asset Valuation Standards
 *    - Credit Risk Assessment Guidelines
 *    - Documentation Requirements
 * 
 * 3. AACFB (American Association of Commercial Finance Brokers)
 *    - Due Diligence Requirements
 *    - Disclosure Standards
 *    - Documentation Requirements
 */

const ComplianceStandards = {
    dscr: {
        minimum: 1.25,
        preferred: 1.5,
        exceptional: 2.0
    },
    workingCapital: {
        minimum: 1.5,
        preferred: 2.0,
        exceptional: 3.0
    },
    documentation: {
        required: [
            'bankStatements',
            'taxReturns',
            'financialStatements',
            'collateralDocumentation'
        ],
        retention: '7years'
    },
    
    creditMetrics: {
        personalCreditScore: {
            minimum: 650,
            preferred: 700,
            exceptional: 750
        },
        businessCreditScore: {
            minimum: 160,
            preferred: 180,
            exceptional: 200
        }
    },
    
    industryRatios: {
        quickRatio: {
            minimum: 1.0,
            preferred: 1.5
        },
        debtToEquity: {
            maximum: 4.0,
            preferred: 3.0
        },
        inventoryTurnover: {
            minimum: 4.0,
            preferred: 6.0
        }
    },

    riskAssessment: {
        concentrationLimits: {
            singleCustomer: 0.20,    // Max 20% revenue from single customer
            industryExposure: 0.25   // Max 25% exposure to single industry
        },
        cashFlowMetrics: {
            operatingCashFlow: {
                minimum: 1.35,       // Operating Cash Flow Coverage
                preferred: 1.50
            }
        }
    }
};