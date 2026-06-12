/**
 * Test AlertsEngineService functionality
 * 
 * This script tests the AlertsEngineService with sample data to demonstrate
 * how different types of alerts are generated and prioritized.
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

// Sample application data
const sampleApplicationData = {
    businessName: "ABC Restaurant LLC",
    industry: "restaurant",
    requestedAmount: 50000,
    businessType: "LLC",
    yearsInBusiness: 2,
    annualRevenue: 250000,
    monthlyRevenue: 20833,
    employeeCount: 8
};

// Sample financial insights report with various risk indicators
const sampleFinsightReport = {
    riskAnalysis: {
        nsfCount: 3,
        totalNsfFees: 105,
        nsfFrequency: "monthly",
        averageBalance: 450,
        minimumBalance: -150,
        daysBelow100: 12,
        velocityRatio: 3.8,
        totalDeposits: 45000,
        totalWithdrawals: 48500,
        netCashFlow: -3500
    },
    incomeStability: {
        stabilityScore: 55,
        regularIncome: false,
        incomeVariability: "high"
    },
    veritasScore: {
        score: 42,
        grade: "D",
        riskLevel: "HIGH"
    },
    transactions: [
        // Sample transactions with various patterns
        { amount: 5000, date: "2025-01-15", description: "CASH WITHDRAWAL", type: "withdrawal" },
        { amount: -3000, date: "2025-01-14", description: "ATM CASH WITHDRAWAL", type: "withdrawal" },
        { amount: 9500, date: "2025-01-13", description: "CASH DEPOSIT", type: "deposit" },
        { amount: 9800, date: "2025-01-12", description: "CASH DEPOSIT", type: "deposit" },
        { amount: -2500, date: "2025-01-11", description: "CASH WITHDRAWAL", type: "withdrawal" },
        { amount: 15000, date: "2025-01-10", description: "WIRE TRANSFER", type: "deposit" },
        { amount: -35, date: "2025-01-09", description: "NSF FEE", type: "fee" },
        { amount: 2000, date: "2025-01-08", description: "CASH DEPOSIT", type: "deposit" },
        { amount: 2000, date: "2025-01-07", description: "CASH DEPOSIT", type: "deposit" },
        { amount: 2000, date: "2025-01-06", description: "CASH DEPOSIT", type: "deposit" },
        { amount: -1000, date: "2025-01-05", description: "ATM WITHDRAWAL", type: "withdrawal" },
        { amount: -1000, date: "2025-01-04", description: "ATM WITHDRAWAL", type: "withdrawal" },
        { amount: -1000, date: "2025-01-03", description: "ATM WITHDRAWAL", type: "withdrawal" },
        { amount: -1000, date: "2025-01-02", description: "ATM WITHDRAWAL", type: "withdrawal" },
        { amount: -1000, date: "2025-01-01", description: "ATM WITHDRAWAL", type: "withdrawal" },
        // Add weekend transactions for pattern detection
        { amount: 5000, date: "2025-01-18", description: "WEEKEND DEPOSIT", type: "deposit" }, // Saturday
        { amount: 3000, date: "2025-01-19", description: "WEEKEND DEPOSIT", type: "deposit" }, // Sunday
        { amount: 4000, date: "2025-01-25", description: "WEEKEND DEPOSIT", type: "deposit" }, // Saturday
        { amount: 2000, date: "2025-01-26", description: "WEEKEND DEPOSIT", type: "deposit" }, // Sunday
        // Add more transactions to reach minimum threshold
        ...Array.from({ length: 15 }, (_, i) => ({
            amount: Math.random() > 0.5 ? Math.floor(Math.random() * 1000) + 100 : -(Math.floor(Math.random() * 500) + 50),
            date: new Date(2025, 0, i + 20).toISOString().split('T')[0],
            description: Math.random() > 0.5 ? "POS PURCHASE" : "ACH TRANSFER",
            type: Math.random() > 0.5 ? "purchase" : "transfer"
        }))
    ]
};

// Sample SOS verification data with issues
const sampleSosData = {
    found: true,
    isActive: false, // Business found but not active
    businessName: "ABC Restaurant LLC",
    matchedBusinessName: "ABC RESTAURANT GROUP LLC", // Slight name mismatch
    status: "SUSPENDED",
    registrationDate: "2024-11-15", // Recently registered
    state: "CA",
    timestamp: new Date().toISOString(),
    verificationDate: new Date().toISOString()
};

// Test scenarios
console.log('🔍 Testing AlertsEngineService with sample data...\n');

try {
    // Generate alerts using the service
    const alerts = AlertsEngineService.generateAlerts(
        sampleApplicationData,
        sampleFinsightReport,
        sampleSosData
    );

    console.log(`✅ Generated ${alerts.length} alerts successfully\n`);

    // Display alert summary
    const summary = AlertsEngineService.getAlertSummary(alerts);
    console.log('📊 ALERT SUMMARY:');
    console.log(`   Total Alerts: ${summary.total}`);
    console.log(`   🔴 Critical: ${summary.critical}`);
    console.log(`   🟠 High: ${summary.high}`);
    console.log(`   🟡 Medium: ${summary.medium}`);
    console.log(`   🟢 Low: ${summary.low}\n`);

    // Display alerts by category
    console.log('📋 ALERTS BY CATEGORY:');
    Object.entries(summary.categories).forEach(([category, categoryAlerts]) => {
        console.log(`\n${category.toUpperCase()} (${categoryAlerts.length} alerts):`);
        categoryAlerts.forEach(alert => {
            const severityEmoji = {
                'CRITICAL': '🔴',
                'HIGH': '🟠', 
                'MEDIUM': '🟡',
                'LOW': '🟢'
            }[alert.severity];
            
            console.log(`   ${severityEmoji} [${alert.code}] ${alert.message}`);
            
            // Show key data points
            if (alert.data) {
                const keyData = Object.entries(alert.data)
                    .filter(([key]) => !['timestamp', 'examples', 'depositDates', 'withdrawalDates'].includes(key))
                    .slice(0, 3)
                    .map(([key, value]) => {
                        if (typeof value === 'number') {
                            return `${key}: ${value.toFixed(2)}`;
                        }
                        return `${key}: ${value}`;
                    })
                    .join(', ');
                
                if (keyData) {
                    console.log(`     • ${keyData}`);
                }
            }
        });
    });

    // Test with different scenarios
    console.log('\n\n🔄 Testing different scenarios...\n');

    // Scenario 1: Clean business with good financials
    console.log('📈 Scenario 1: Clean Business');
    const cleanFinsight = {
        riskAnalysis: {
            nsfCount: 0,
            averageBalance: 15000,
            minimumBalance: 5000,
            daysBelow100: 0,
            velocityRatio: 1.2,
            totalDeposits: 50000,
            totalWithdrawals: 45000,
            netCashFlow: 5000
        },
        incomeStability: {
            stabilityScore: 85,
            regularIncome: true,
            incomeVariability: "low"
        },
        veritasScore: {
            score: 78,
            grade: "B",
            riskLevel: "LOW"
        },
        transactions: Array.from({ length: 50 }, (_, i) => ({
            amount: Math.random() > 0.3 ? Math.floor(Math.random() * 2000) + 500 : -(Math.floor(Math.random() * 800) + 100),
            date: new Date(2025, 0, i + 1).toISOString().split('T')[0],
            description: "NORMAL BUSINESS TRANSACTION",
            type: "business"
        }))
    };

    const cleanSos = {
        found: true,
        isActive: true,
        businessName: "ABC Restaurant LLC",
        matchedBusinessName: "ABC Restaurant LLC",
        status: "ACTIVE",
        registrationDate: "2020-05-15",
        state: "CA",
        timestamp: new Date().toISOString()
    };

    const cleanAlerts = AlertsEngineService.generateAlerts(sampleApplicationData, cleanFinsight, cleanSos);
    console.log(`   Generated ${cleanAlerts.length} alerts for clean business`);
    
    if (cleanAlerts.length > 0) {
        cleanAlerts.forEach(alert => {
            console.log(`   • [${alert.severity}] ${alert.code}: ${alert.message}`);
        });
    } else {
        console.log('   ✅ No significant alerts - clean profile');
    }

    // Scenario 2: High-risk business
    console.log('\n🚨 Scenario 2: High-Risk Business');
    const highRiskApp = {
        ...sampleApplicationData,
        businessName: "Cannabis Dispensary LLC",
        industry: "cannabis retail"
    };

    const highRiskFinsight = {
        riskAnalysis: {
            nsfCount: 8,
            totalNsfFees: 280,
            averageBalance: 150,
            minimumBalance: -800,
            daysBelow100: 25,
            velocityRatio: 8.5,
            totalDeposits: 85000,
            totalWithdrawals: 90000,
            netCashFlow: -5000
        },
        incomeStability: {
            stabilityScore: 25,
            regularIncome: false,
            incomeVariability: "extreme"
        },
        veritasScore: {
            score: 18,
            grade: "F",
            riskLevel: "VERY HIGH"
        },
        transactions: [
            { amount: -25000, date: "2025-01-15", description: "LARGE CASH WITHDRAWAL", type: "withdrawal" },
            { amount: -15000, date: "2025-01-14", description: "CASH WITHDRAWAL", type: "withdrawal" },
            { amount: 50000, date: "2025-01-13", description: "CASH DEPOSIT", type: "deposit" },
            ...Array.from({ length: 30 }, () => ({
                amount: Math.random() > 0.4 ? -(Math.floor(Math.random() * 5000) + 1000) : Math.floor(Math.random() * 10000) + 2000,
                date: new Date(2025, 0, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
                description: "CASH TRANSACTION",
                type: "cash"
            }))
        ]
    };

    const highRiskAlerts = AlertsEngineService.generateAlerts(highRiskApp, highRiskFinsight, sampleSosData);
    console.log(`   Generated ${highRiskAlerts.length} alerts for high-risk business`);
    
    const highRiskSummary = AlertsEngineService.getAlertSummary(highRiskAlerts);
    console.log(`   🔴 Critical: ${highRiskSummary.critical}, 🟠 High: ${highRiskSummary.high}, 🟡 Medium: ${highRiskSummary.medium}`);

    // Test error handling
    console.log('\n🛠️ Testing error handling...');
    const errorAlerts = AlertsEngineService.generateAlerts(null, null, null);
    console.log(`   Generated ${errorAlerts.length} error alert(s)`);
    if (errorAlerts.length > 0) {
        console.log(`   • [${errorAlerts[0].severity}] ${errorAlerts[0].code}: ${errorAlerts[0].message}`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📄 AlertsEngineService is ready for integration with your application.');
    console.log('💡 Usage: AlertsEngineService.generateAlerts(applicationData, finsightReport, sosData)');

} catch (error) {
    console.error('❌ Error testing AlertsEngineService:', error);
    process.exit(1);
}
