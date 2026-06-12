
/**
 * Test script to verify the credibility alerts implementation
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

console.log('🧪 Testing Credibility Alerts Implementation...\n');

// Test data for revenue mismatch (30% discrepancy)
const testApplicationData = {
    statedAnnualRevenue: 500000, // Stated $500K
    businessStartDate: '2020-01-15', // Started January 2020 (applicant claim)
    // Other existing test data...
    nsfAnalysis: { nsfCount: 1 }, // Below threshold
    balanceAnalysis: { averageBalance: 2000 }, // Above threshold
};

// Test finsight reports that annualize to ~$350K (30% below stated)
const testFinsightReports = [
    {
        analysis: {
            totalDeposits: 24000, // $24K deposits
            balanceAnalysis: { periodDays: 30 } // Over 30 days
        }
    },
    {
        analysis: {
            totalDeposits: 22000, // $22K deposits  
            balanceAnalysis: { periodDays: 30 } // Over 30 days
        }
    },
    {
        analysis: {
            totalDeposits: 25000, // $25K deposits
            balanceAnalysis: { periodDays: 30 } // Over 30 days
        }
    }
    // Total: $71K over 90 days = ~$289K annualized vs $500K stated = 42% discrepancy
];

// Test SOS data showing registration 6 months after claimed start date
const testSosData = {
    registrationDate: '2020-07-20' // Registered July 2020 (6 months after claimed start)
};

console.log('📊 Test Data:');
console.log(`  Stated Annual Revenue: $${testApplicationData.statedAnnualRevenue.toLocaleString()}`);
console.log(`  Stated Business Start: ${testApplicationData.businessStartDate}`);
console.log(`  Official Registration: ${testSosData.registrationDate}`);
console.log(`  Total Deposits Across Reports: $${testFinsightReports.reduce((sum, r) => sum + r.analysis.totalDeposits, 0).toLocaleString()}`);
console.log(`  Total Days Analyzed: ${testFinsightReports.reduce((sum, r) => sum + r.analysis.balanceAnalysis.periodDays, 0)} days\n`);

try {
    const alerts = AlertsEngineService.generateAlertsCustom(
        testApplicationData, 
        testFinsightReports, 
        testSosData
    );
    
    console.log(`✅ Generated ${alerts.length} alerts:\n`);
    
    alerts.forEach((alert, index) => {
        console.log(`Alert ${index + 1}:`);
        console.log(`  Code: ${alert.code}`);
        console.log(`  Severity: ${alert.severity}`);
        console.log(`  Message: ${alert.message}`);
        if (alert.code === 'GROSS_ANNUAL_REVENUE_MISMATCH') {
            console.log(`  Revenue Details:`);
            console.log(`    Stated: $${alert.data.statedAnnualRevenue.toLocaleString()}`);
            console.log(`    Annualized: $${alert.data.annualizedDeposits.toLocaleString()}`);
            console.log(`    Discrepancy: ${alert.data.discrepancyPercentage}%`);
            console.log(`    Overstated: ${alert.data.isOverstated}`);
        }
        if (alert.code === 'TIME_IN_BUSINESS_DISCREPANCY') {
            console.log(`  Time Details:`);
            console.log(`    Stated Start: ${alert.data.statedStartDate}`);
            console.log(`    Official Registration: ${alert.data.officialRegistrationDate}`);
            console.log(`    Months Difference: ${alert.data.discrepancyMonths}`);
        }
        console.log('');
    });
    
    // Verify expected alerts are present
    const expectedCodes = ['GROSS_ANNUAL_REVENUE_MISMATCH', 'TIME_IN_BUSINESS_DISCREPANCY'];
    const actualCodes = alerts.map(alert => alert.code);
    
    console.log('🔍 Credibility Alert Verification:');
    expectedCodes.forEach(expectedCode => {
        const found = actualCodes.includes(expectedCode);
        console.log(`  ${expectedCode}: ${found ? '✅ Found' : '❌ Missing'}`);
    });
    
    console.log('\n📊 Alert Summary:');
    console.log(`  Total Alerts: ${alerts.length}`);
    console.log(`  Critical: ${alerts.filter(a => a.severity === 'CRITICAL').length}`);
    console.log(`  High: ${alerts.filter(a => a.severity === 'HIGH').length}`);
    console.log(`  Medium: ${alerts.filter(a => a.severity === 'MEDIUM').length}`);
    console.log(`  Low: ${alerts.filter(a => a.severity === 'LOW').length}`);
    
} catch (error) {
    console.error('❌ Error testing credibility alerts:', error);
}

console.log('\n🎉 Credibility alerts test completed!');
