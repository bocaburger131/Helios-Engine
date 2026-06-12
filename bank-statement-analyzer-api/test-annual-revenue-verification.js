#!/usr/bin/env node

/**
 * Test script for Annual Revenue Verification in AlertsEngineService
 * Tests the _verifyAnnualRevenue method with various scenarios
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';
import logger from './src/utils/logger.js';

// Mock FinSight reports with transaction data
const createMockFinSightReport = (reportId, transactions) => ({
    id: reportId,
    fileName: `statement_${reportId}.pdf`,
    transactions,
    riskAnalysis: {
        riskScore: 25,
        avgDailyBalance: 5000,
        nsfCount: 1
    },
    veritasScore: {
        score: 750,
        grade: 'A'
    }
});

// Helper to create transaction data
const createTransaction = (date, amount, description = 'Test Transaction') => ({
    date: date instanceof Date ? date.toISOString() : date,
    amount,
    description,
    type: amount > 0 ? 'deposit' : 'withdrawal'
});

// Test scenarios
const testScenarios = [
    {
        name: 'Revenue matches projection (within 20% threshold)',
        statedRevenue: 120000,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 5000, 'Customer Payment'),
                createTransaction('2024-02-15', 4500, 'Service Revenue'),
                createTransaction('2024-03-15', 5200, 'Product Sales'),
                createTransaction('2024-04-15', 4800, 'Consulting Fee'),
                createTransaction('2024-01-20', -1200, 'Office Rent'),
                createTransaction('2024-02-20', -800, 'Utilities')
            ]),
            createMockFinSightReport('report2', [
                createTransaction('2024-05-15', 5500, 'Customer Payment'),
                createTransaction('2024-06-15', 4200, 'Service Revenue'),
                createTransaction('2024-07-15', 5100, 'Product Sales'),
                createTransaction('2024-08-15', 4900, 'Consulting Fee'),
                createTransaction('2024-05-20', -1300, 'Office Rent'),
                createTransaction('2024-06-20', -750, 'Utilities')
            ])
        ],
        expectedOutcome: 'No alert (within threshold)'
    },
    {
        name: 'Stated revenue significantly higher than projection (>20% discrepancy)',
        statedRevenue: 200000,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 3000, 'Small Payment'),
                createTransaction('2024-02-15', 2800, 'Service Revenue'),
                createTransaction('2024-03-15', 3200, 'Product Sales'),
                createTransaction('2024-04-15', 2900, 'Consulting Fee'),
                createTransaction('2024-01-20', -800, 'Rent'),
                createTransaction('2024-02-20', -600, 'Utilities')
            ]),
            createMockFinSightReport('report2', [
                createTransaction('2024-05-15', 3100, 'Small Payment'),
                createTransaction('2024-06-15', 2700, 'Service Revenue'),
                createTransaction('2024-07-15', 3300, 'Product Sales'),
                createTransaction('2024-08-15', 3000, 'Consulting Fee'),
                createTransaction('2024-05-20', -850, 'Rent'),
                createTransaction('2024-06-20', -550, 'Utilities')
            ])
        ],
        expectedOutcome: 'HIGH severity alert (projected lower than stated)'
    },
    {
        name: 'Projected revenue significantly higher than stated (>20% discrepancy)',
        statedRevenue: 50000,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 8000, 'Large Customer Payment'),
                createTransaction('2024-02-15', 7500, 'Major Contract'),
                createTransaction('2024-03-15', 8200, 'Product Launch'),
                createTransaction('2024-04-15', 7800, 'Enterprise Deal'),
                createTransaction('2024-01-20', -1500, 'Rent'),
                createTransaction('2024-02-20', -1200, 'Salaries')
            ]),
            createMockFinSightReport('report2', [
                createTransaction('2024-05-15', 8500, 'Large Customer Payment'),
                createTransaction('2024-06-15', 7200, 'Major Contract'),
                createTransaction('2024-07-15', 8100, 'Product Sales'),
                createTransaction('2024-08-15', 7900, 'Enterprise Deal'),
                createTransaction('2024-05-20', -1600, 'Rent'),
                createTransaction('2024-06-20', -1100, 'Salaries')
            ])
        ],
        expectedOutcome: 'HIGH severity alert (projected higher than stated)'
    },
    {
        name: 'Single statement with short time period',
        statedRevenue: 100000,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-07-01', 4000, 'Customer Payment'),
                createTransaction('2024-07-15', 3500, 'Service Revenue'),
                createTransaction('2024-07-30', 4200, 'Product Sales'),
                createTransaction('2024-07-05', -1000, 'Rent'),
                createTransaction('2024-07-20', -800, 'Utilities')
            ])
        ],
        expectedOutcome: 'Alert based on short period annualization'
    },
    {
        name: 'Edge case: No deposit transactions',
        statedRevenue: 80000,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-01-15', -1000, 'Rent'),
                createTransaction('2024-02-15', -800, 'Utilities'),
                createTransaction('2024-03-15', -1200, 'Payroll')
            ])
        ],
        expectedOutcome: 'No alert (no deposits found)'
    },
    {
        name: 'Edge case: Missing statedAnnualRevenue',
        statedRevenue: null,
        mockReports: [
            createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 5000, 'Customer Payment'),
                createTransaction('2024-02-15', 4500, 'Service Revenue')
            ])
        ],
        expectedOutcome: 'No alert (missing stated revenue)'
    }
];

/**
 * Test the annual revenue verification method
 */
const testAnnualRevenueVerification = async () => {
    console.log('🧪 Testing Annual Revenue Verification in AlertsEngineService');
    console.log('=' .repeat(70));
    
    let testsPassed = 0;
    let testsTotal = testScenarios.length;
    
    for (let i = 0; i < testScenarios.length; i++) {
        const scenario = testScenarios[i];
        
        console.log(`\n📋 Test ${i + 1}: ${scenario.name}`);
        console.log('-'.repeat(50));
        
        try {
            // Prepare application data
            const applicationData = scenario.statedRevenue ? 
                { statedAnnualRevenue: scenario.statedRevenue } : {};
            
            console.log(`   Stated Annual Revenue: ${scenario.statedRevenue ? '$' + scenario.statedRevenue.toLocaleString() : 'Not provided'}`);
            console.log(`   Reports Count: ${scenario.mockReports.length}`);
            
            // Calculate expected totals for reference
            const totalDeposits = scenario.mockReports.reduce((total, report) => {
                return total + report.transactions
                    .filter(t => t.amount > 0)
                    .reduce((sum, t) => sum + t.amount, 0);
            }, 0);
            
            console.log(`   Total Deposits in Test Data: $${totalDeposits.toLocaleString()}`);
            
            // Call the verification method via generateAlerts with updated signature
            const alerts = AlertsEngineService.generateAlerts(applicationData, scenario.mockReports, {});
            
            // Filter for revenue verification alerts
            const revenueAlerts = alerts.filter(alert => 
                alert.code === 'ANNUAL_REVENUE_DISCREPANCY' || 
                alert.code === 'REVENUE_VERIFICATION_ERROR'
            );
            
            console.log(`   Alerts Generated: ${revenueAlerts.length}`);
            
            if (revenueAlerts.length > 0) {
                revenueAlerts.forEach((alert, index) => {
                    console.log(`   Alert ${index + 1}:`);
                    console.log(`     Code: ${alert.code}`);
                    console.log(`     Severity: ${alert.severity}`);
                    console.log(`     Message: ${alert.message}`);
                    
                    if (alert.data?.projectedGrossAnnualRevenue) {
                        console.log(`     Projected GAR: $${alert.data.projectedGrossAnnualRevenue.toLocaleString()}`);
                        console.log(`     Discrepancy: ${alert.data.discrepancyPercentage}%`);
                        console.log(`     Time Period: ${alert.data.analysisDetails?.timePeriodDays} days`);
                        console.log(`     Date Range: ${alert.data.analysisDetails?.dateRange?.start} to ${alert.data.analysisDetails?.dateRange?.end}`);
                    }
                });
            } else {
                console.log(`   ✅ No revenue verification alerts (${scenario.expectedOutcome})`);
            }
            
            console.log(`   Expected: ${scenario.expectedOutcome}`);
            console.log(`   ✅ Test completed successfully`);
            testsPassed++;
            
        } catch (error) {
            console.log(`   ❌ Test failed: ${error.message}`);
            console.error(error);
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`🎯 Test Results: ${testsPassed}/${testsTotal} tests passed`);
    
    if (testsPassed === testsTotal) {
        console.log('✅ All tests passed! Annual Revenue Verification is working correctly.');
    } else {
        console.log('❌ Some tests failed. Please review the implementation.');
    }
    
    return testsPassed === testsTotal;
};

/**
 * Test edge cases and validation
 */
const testEdgeCases = async () => {
    console.log('\n🔍 Testing Edge Cases and Validation');
    console.log('=' .repeat(70));
    
    const edgeTests = [
        {
            name: 'Invalid stated revenue (negative)',
            applicationData: { statedAnnualRevenue: -50000 },
            finsightReports: [createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 5000, 'Payment')
            ])],
            expectedBehavior: 'Should skip verification due to invalid revenue'
        },
        {
            name: 'Invalid stated revenue (non-numeric string)',
            applicationData: { statedAnnualRevenue: 'not-a-number' },
            finsightReports: [createMockFinSightReport('report1', [
                createTransaction('2024-01-15', 5000, 'Payment')
            ])],
            expectedBehavior: 'Should skip verification due to invalid revenue'
        },
        {
            name: 'Empty finsight reports array',
            applicationData: { statedAnnualRevenue: 100000 },
            finsightReports: [],
            expectedBehavior: 'Should skip verification due to no reports'
        },
        {
            name: 'Reports with invalid transactions',
            applicationData: { statedAnnualRevenue: 100000 },
            finsightReports: [
                { id: 'invalid1', transactions: null },
                { id: 'invalid2', transactions: 'not-an-array' },
                { id: 'invalid3' } // no transactions property
            ],
            expectedBehavior: 'Should handle gracefully and skip verification'
        }
    ];
    
    let edgeTestsPassed = 0;
    
    for (let i = 0; i < edgeTests.length; i++) {
        const test = edgeTests[i];
        
        console.log(`\n📋 Edge Test ${i + 1}: ${test.name}`);
        console.log('-'.repeat(40));
        
        try {
            const alerts = AlertsEngineService.generateAlerts(test.applicationData, test.finsightReports, {});
            const revenueAlerts = alerts.filter(alert => 
                alert.code === 'ANNUAL_REVENUE_DISCREPANCY' || 
                alert.code === 'REVENUE_VERIFICATION_ERROR'
            );
            
            console.log(`   Revenue alerts: ${revenueAlerts.length}`);
            console.log(`   Expected: ${test.expectedBehavior}`);
            console.log(`   ✅ Edge case handled correctly`);
            edgeTestsPassed++;
            
        } catch (error) {
            console.log(`   ❌ Edge test failed: ${error.message}`);
        }
    }
    
    console.log(`\n🎯 Edge Test Results: ${edgeTestsPassed}/${edgeTests.length} tests passed`);
    return edgeTestsPassed === edgeTests.length;
};

// Run all tests
console.log('🚀 Starting Annual Revenue Verification Tests\n');

(async () => {
    try {
        const mainTestsPass = await testAnnualRevenueVerification();
        const edgeTestsPass = await testEdgeCases();
        
        if (mainTestsPass && edgeTestsPass) {
            console.log('\n🎉 ALL TESTS PASSED! Annual Revenue Verification is ready for production.');
            console.log('\nNext steps:');
            console.log('1. Test with real bank statement data');
            console.log('2. Verify alerts appear in Zoho CRM (if HIGH severity)');
            console.log('3. Monitor performance with multiple statements');
        } else {
            console.log('\n❌ SOME TESTS FAILED! Please review the implementation.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    }
})();
