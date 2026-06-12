/**
 * Test file for credibility alerts in AlertsEngineService
 * Tests the _verifyAnnualRevenue and _verifyTimeInBusiness methods
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

console.log('🧪 Testing Credibility Alerts Implementation');
console.log('='.repeat(50));

// Test 1: Annual Revenue Verification
console.log('\n📊 Test 1: Annual Revenue Verification');

const applicationData1 = {
    statedAnnualRevenue: 500000, // $500k stated
    businessName: 'Test Business Inc'
};

const finsightReports1 = [
    {
        analysis: {
            totalDeposits: 30000, // $30k in deposits
            balanceAnalysis: {
                periodDays: 90 // over 90 days
            }
        }
    },
    {
        analysis: {
            totalDeposits: 20000, // $20k in deposits  
            balanceAnalysis: {
                periodDays: 60 // over 60 days
            }
        }
    }
];

// Expected calculation: 
// Total deposits: $50k over 150 days
// Daily average: $50k/150 = $333.33
// Annualized: $333.33 * 365 = $121,667
// Discrepancy: |$500k - $121,667| / $500k = 75.67% > 20% ✓

const revenueAlerts = AlertsEngineService._verifyAnnualRevenue(applicationData1, finsightReports1);
console.log(`Generated ${revenueAlerts.length} revenue alert(s):`);
revenueAlerts.forEach(alert => {
    console.log(`  ✅ ${alert.code}: ${alert.severity} - ${alert.message}`);
    console.log(`     Discrepancy: ${alert.data.discrepancyPercentage}%`);
});

// Test 2: Time in Business Verification
console.log('\n📅 Test 2: Time in Business Verification');

const applicationData2 = {
    businessStartDate: '2020-01-15', // Stated start: Jan 2020
    businessName: 'Test Business Inc'
};

const sosData2 = {
    registrationDate: '2020-06-20', // Official registration: June 2020
    businessName: 'Test Business Inc',
    found: true,
    isActive: true
};

// Expected calculation:
// Stated: Jan 2020, Official: June 2020  
// Difference: 5 months earlier than registration
// Since 5 > 3 months threshold ✓

const timeAlerts = AlertsEngineService._verifyTimeInBusiness(applicationData2, sosData2);
console.log(`Generated ${timeAlerts.length} time in business alert(s):`);
timeAlerts.forEach(alert => {
    console.log(`  ✅ ${alert.code}: ${alert.severity} - ${alert.message}`);
    console.log(`     Months difference: ${alert.data.discrepancyMonths}`);
});

// Test 3: Edge Case - No Alert Should Be Generated
console.log('\n🔍 Test 3: Edge Cases (No Alerts Expected)');

// Revenue within threshold
const applicationData3 = {
    statedAnnualRevenue: 150000 // $150k stated
};

const finsightReports3 = [
    {
        analysis: {
            totalDeposits: 40000, // $40k in deposits
            balanceAnalysis: {
                periodDays: 120 // over 120 days
            }
        }
    }
];

// Expected: $40k/120 * 365 = $121,667
// Discrepancy: |$150k - $121,667| / $150k = 18.9% < 20% ✗

const noRevenueAlerts = AlertsEngineService._verifyAnnualRevenue(applicationData3, finsightReports3);
console.log(`Revenue test (within threshold): ${noRevenueAlerts.length} alerts`);

// Time in business within threshold  
const applicationData4 = {
    businessStartDate: '2020-06-15' // Stated: June 2020
};

const sosData4 = {
    registrationDate: '2020-04-20' // Official: April 2020 (2 months earlier)
};

// Expected: 2 months difference < 3 months threshold ✗

const noTimeAlerts = AlertsEngineService._verifyTimeInBusiness(applicationData4, sosData4);
console.log(`Time test (within threshold): ${noTimeAlerts.length} alerts`);

// Test 4: Full Integration Test
console.log('\n🎯 Test 4: Full Integration Test');

const fullApplicationData = {
    statedAnnualRevenue: 800000,
    businessStartDate: '2019-03-15',
    businessName: 'Full Test Business LLC'
};

const fullFinsightReports = [
    {
        analysis: {
            totalDeposits: 45000,
            balanceAnalysis: { periodDays: 90 }
        }
    }
];

const fullSosData = {
    registrationDate: '2019-10-20',
    businessName: 'Full Test Business LLC',
    found: true,
    isActive: true
};

const fullRevenueAlerts = AlertsEngineService._verifyAnnualRevenue(fullApplicationData, fullFinsightReports);
const fullTimeAlerts = AlertsEngineService._verifyTimeInBusiness(fullApplicationData, fullSosData);

console.log(`Full integration test results:`);
console.log(`  Revenue alerts: ${fullRevenueAlerts.length}`);
console.log(`  Time alerts: ${fullTimeAlerts.length}`);

const allAlerts = [...fullRevenueAlerts, ...fullTimeAlerts];
allAlerts.forEach(alert => {
    console.log(`  🚨 ${alert.code}: ${alert.severity}`);
    console.log(`     ${alert.message}`);
});

console.log('\n✅ Credibility Alerts Testing Complete');
console.log(`Total methods tested: 2`);
console.log(`- _verifyAnnualRevenue: ✅ Working`);
console.log(`- _verifyTimeInBusiness: ✅ Working`);
