
/**
 * Test edge cases for credibility alerts
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

console.log('🧪 Testing Credibility Alerts Edge Cases...\n');

// Test Case 1: Revenue within threshold (should NOT trigger alert)
console.log('Test Case 1: Revenue within 20% threshold');
const case1ApplicationData = {
    statedAnnualRevenue: 300000, // $300K stated
};

const case1FinsightReports = [
    {
        analysis: {
            totalDeposits: 20000, // $20K deposits over 30 days = ~$243K annualized (19% below stated - within threshold)
            balanceAnalysis: { periodDays: 30 }
        }
    }
];

let alerts1 = AlertsEngineService.generateAlertsCustom(case1ApplicationData, case1FinsightReports, {});
console.log(`  Result: ${alerts1.filter(a => a.code === 'GROSS_ANNUAL_REVENUE_MISMATCH').length > 0 ? '❌ Alert generated (should not)' : '✅ No alert (correct)'}\n`);

// Test Case 2: Time in business within threshold (should NOT trigger alert)
console.log('Test Case 2: Time in business within 3 month threshold');
const case2ApplicationData = {
    businessStartDate: '2020-05-15', // May 2020
};

const case2SosData = {
    registrationDate: '2020-07-20' // July 2020 (2 months later - within threshold)
};

let alerts2 = AlertsEngineService.generateAlertsCustom(case2ApplicationData, [], case2SosData);
console.log(`  Result: ${alerts2.filter(a => a.code === 'TIME_IN_BUSINESS_DISCREPANCY').length > 0 ? '❌ Alert generated (should not)' : '✅ No alert (correct)'}\n`);

// Test Case 3: Missing data (should handle gracefully)
console.log('Test Case 3: Missing data handling');
const case3ApplicationData = {}; // No revenue or dates
const case3FinsightReports = []; // Empty reports
const case3SosData = {}; // No SOS data

let alerts3 = AlertsEngineService.generateAlertsCustom(case3ApplicationData, case3FinsightReports, case3SosData);
console.log(`  Result: ${alerts3.length} alerts (should be 0 credibility alerts)\n`);

// Test Case 4: Extreme discrepancies
console.log('Test Case 4: Extreme discrepancies');
const case4ApplicationData = {
    statedAnnualRevenue: 1000000, // $1M stated
    businessStartDate: '2019-01-01', // January 2019
};

const case4FinsightReports = [
    {
        analysis: {
            totalDeposits: 5000, // Very low deposits = ~$60K annualized (94% discrepancy)
            balanceAnalysis: { periodDays: 30 }
        }
    }
];

const case4SosData = {
    registrationDate: '2020-01-01' // 12 months after claimed start
};

let alerts4 = AlertsEngineService.generateAlertsCustom(case4ApplicationData, case4FinsightReports, case4SosData);
const revenueAlert = alerts4.find(a => a.code === 'GROSS_ANNUAL_REVENUE_MISMATCH');
const timeAlert = alerts4.find(a => a.code === 'TIME_IN_BUSINESS_DISCREPANCY');

console.log(`  Revenue Alert: ${revenueAlert ? `✅ ${revenueAlert.data.discrepancyPercentage}% discrepancy` : '❌ Missing'}`);
console.log(`  Time Alert: ${timeAlert ? `✅ ${timeAlert.data.discrepancyMonths} months discrepancy` : '❌ Missing'}\n`);

console.log('🎉 Edge case testing completed!');
