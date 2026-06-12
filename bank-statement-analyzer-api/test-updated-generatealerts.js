#!/usr/bin/env node

/**
 * Test script to verify the updated AlertsEngineService.generateAlerts method
 * with the new signature: generateAlerts(applicationData, finsightReportsArray, sosData)
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

console.log('🧪 Testing Updated AlertsEngineService.generateAlerts Method');
console.log('=' * 60);

// Sample application data
const applicationData = {
    businessName: 'Test Business LLC',
    annualRevenue: 500000,
    timeInBusiness: 24, // months
    industryType: 'retail',
    applicationDate: new Date().toISOString(),
    loanAmount: 100000,
    purpose: 'working capital'
};

// Sample FinSight reports array
const finsightReportsArray = [
    {
        accountNumber: 'ACCT123',
        accountType: 'checking',
        statementPeriod: '2024-01',
        transactions: [
            { date: '2024-01-15', amount: 5000, type: 'deposit', description: 'Customer payment' },
            { date: '2024-01-20', amount: -1200, type: 'withdrawal', description: 'Rent payment' }
        ],
        summary: {
            totalDeposits: 25000,
            totalWithdrawals: 18000,
            netCashFlow: 7000,
            averageBalance: 12000,
            nsfCount: 0,
            negativeDays: 0
        },
        riskAnalysis: {
            riskScore: 65,
            riskLevel: 'MEDIUM'
        },
        veritasScore: {
            score: 78,
            factors: ['consistent_deposits', 'positive_cash_flow']
        }
    }
];

// Sample SOS (Statement of Source) data
const sosData = {
    businessStartDate: '2022-01-15',
    registrationState: 'CA',
    federalTaxId: '12-3456789',
    businessType: 'LLC',
    principalOwners: ['John Doe'],
    verificationStatus: 'verified',
    timeInBusiness: 25 // months
};

console.log('\n1️⃣ Testing with all parameters provided...');
try {
    const alerts1 = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray, sosData);
    console.log(`✅ Success! Generated ${alerts1.length} alerts with full data`);
    
    // Show breakdown by severity
    const criticalAlerts = alerts1.filter(a => a.severity === 'CRITICAL');
    const highAlerts = alerts1.filter(a => a.severity === 'HIGH');
    const mediumAlerts = alerts1.filter(a => a.severity === 'MEDIUM');
    const lowAlerts = alerts1.filter(a => a.severity === 'LOW');
    
    console.log(`   📊 Alert breakdown: CRITICAL: ${criticalAlerts.length}, HIGH: ${highAlerts.length}, MEDIUM: ${mediumAlerts.length}, LOW: ${lowAlerts.length}`);
    
    if (alerts1.length > 0) {
        console.log(`   🔍 Sample alert: ${alerts1[0].code} - ${alerts1[0].message}`);
    }
    
} catch (error) {
    console.error('❌ Error with full parameters:', error.message);
}

console.log('\n2️⃣ Testing with empty sosData...');
try {
    const alerts2 = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray, {});
    console.log(`✅ Success! Generated ${alerts2.length} alerts with empty sosData`);
} catch (error) {
    console.error('❌ Error with empty sosData:', error.message);
}

console.log('\n3️⃣ Testing with undefined sosData (should use default)...');
try {
    const alerts3 = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray);
    console.log(`✅ Success! Generated ${alerts3.length} alerts with undefined sosData`);
} catch (error) {
    console.error('❌ Error with undefined sosData:', error.message);
}

console.log('\n4️⃣ Testing SOS-specific verification...');
try {
    // Create discrepancy in time in business for testing
    const discrepantAppData = {
        ...applicationData,
        timeInBusiness: 36 // months (different from sosData)
    };
    
    const alerts4 = AlertsEngineService.generateAlerts(discrepantAppData, finsightReportsArray, sosData);
    console.log(`✅ Success! Generated ${alerts4.length} alerts with time-in-business discrepancy`);
    
    // Look for time-in-business alerts
    const timeAlerts = alerts4.filter(a => a.code && a.code.includes('TIME_IN_BUSINESS'));
    if (timeAlerts.length > 0) {
        console.log(`   🎯 Found ${timeAlerts.length} time-in-business alert(s)`);
        timeAlerts.forEach(alert => {
            console.log(`      - ${alert.code}: ${alert.message}`);
        });
    }
    
} catch (error) {
    console.error('❌ Error with discrepant data:', error.message);
}

console.log('\n✅ Updated AlertsEngineService.generateAlerts method testing complete!');
console.log('\n💡 Method signature: generateAlerts(applicationData, finsightReportsArray, sosData = {})');
