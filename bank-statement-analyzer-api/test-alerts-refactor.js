import AlertsEngineService from './src/services/AlertsEngineService.js';

// Test the refactored generateAlerts method
console.log('Testing refactored AlertsEngineService.generateAlerts method...');

// Sample application data with financial indicators for testing the specific alert methods
const applicationData = {
    businessName: 'Test Business LLC',
    requestedAmount: 50000,
    industry: 'retail',
    statedAnnualRevenue: 600000, // For testing revenue verification
    businessStartDate: '2022-01-15', // For testing time in business
    
    // Financial data structure for the specific alert methods
    nsfAnalysis: {
        nsfCount: 4, // Should trigger HIGH_NSF_COUNT alert (>= 3)
        nsfTransactions: [
            { date: '2024-01-10', amount: -35, description: 'NSF Fee #1' },
            { date: '2024-01-15', amount: -35, description: 'NSF Fee #2' },
            { date: '2024-01-20', amount: -35, description: 'NSF Fee #3' },
            { date: '2024-01-25', amount: -35, description: 'NSF Fee #4' }
        ]
    },
    
    balanceAnalysis: {
        averageBalance: 350, // Should trigger LOW_AVERAGE_BALANCE alert (< $500)
        negativeDays: [
            { date: '2024-01-15', balance: -125 },
            { date: '2024-01-16', balance: -50 }
        ], // Should trigger NEGATIVE_BALANCE_DAYS alert
        periodDays: 30
    }
};

// Sample FinSight reports array (multiple bank statements) with deposit data for revenue verification
const finsightReportsArray = [
    {
        id: 'report_1',
        analysis: {
            totalDeposits: 75000, // $75K deposits
            balanceAnalysis: { periodDays: 90 }, // Over 90 days
            financialSummary: { totalDeposits: 75000 }
        },
        riskAnalysis: {
            nsfCount: 2,
            averageBalance: 1500,
            minimumBalance: 200,
            riskScore: 35
        },
        sosData: {
            businessExists: true,
            status: 'ACTIVE'
        }
    },
    {
        id: 'report_2',
        analysis: {
            totalDeposits: 80000, // $80K deposits  
            balanceAnalysis: { periodDays: 90 }, // Over 90 days
            financialSummary: { totalDeposits: 80000 }
        },
        riskAnalysis: {
            nsfCount: 0,
            averageBalance: 3200,
            minimumBalance: 500,
            riskScore: 15
        }
    },
    {
        id: 'report_3',
        analysis: {
            totalDeposits: 65000, // $65K deposits
            balanceAnalysis: { periodDays: 90 }, // Over 90 days  
            financialSummary: { totalDeposits: 65000 }
        },
        riskAnalysis: {
            nsfCount: 5,
            averageBalance: 800,
            minimumBalance: -100,
            riskScore: 85
        }
    }
];

try {
    // Call the refactored method with the new signature including sosData for credibility testing
    const sosData = {
        registrationDate: '2022-06-15', // 5 months after stated business start date
        businessType: 'LLC',
        status: 'ACTIVE'
    };
    
    const alerts = AlertsEngineService.generateAlerts(applicationData, finsightReportsArray, sosData);
    
    console.log(`✅ Success! Generated ${alerts.length} alerts`);
    console.log('\nAlert Summary:');
    console.log(`- CRITICAL: ${alerts.filter(a => a.severity === 'CRITICAL').length}`);
    console.log(`- HIGH: ${alerts.filter(a => a.severity === 'HIGH').length}`);
    console.log(`- MEDIUM: ${alerts.filter(a => a.severity === 'MEDIUM').length}`);
    console.log(`- LOW: ${alerts.filter(a => a.severity === 'LOW').length}`);
    
    // Test the specific financial alert methods directly
    console.log('\n🔍 Testing Financial Alert Methods Directly:');
    console.log('-'.repeat(50));
    
    const nsfAlerts = AlertsEngineService._checkHighNsfCount(applicationData);
    const balanceAlerts = AlertsEngineService._checkLowAverageBalance(applicationData);
    const negativeDaysAlerts = AlertsEngineService._checkNegativeBalanceDays(applicationData);
    
    console.log(`\n📊 Direct Financial Method Results:`);
    console.log(`• NSF Alerts: ${nsfAlerts.length} (${nsfAlerts.map(a => a.severity).join(', ')})`);
    console.log(`• Balance Alerts: ${balanceAlerts.length} (${balanceAlerts.map(a => a.severity).join(', ')})`);
    console.log(`• Negative Days Alerts: ${negativeDaysAlerts.length} (${negativeDaysAlerts.map(a => a.severity).join(', ')})`);
    
    // Test the credibility alert methods directly
    console.log('\n🔍 Testing Credibility Alert Methods Directly:');
    console.log('-'.repeat(50));
    
    const revenueAlerts = AlertsEngineService._verifyAnnualRevenue(applicationData, finsightReportsArray);
    const timeAlerts = AlertsEngineService._verifyTimeInBusiness(applicationData, sosData);
    
    console.log(`\n📊 Direct Credibility Method Results:`);
    console.log(`• Revenue Alerts: ${revenueAlerts.length} (${revenueAlerts.map(a => a.severity).join(', ')})`);
    console.log(`• Time in Business Alerts: ${timeAlerts.length} (${timeAlerts.map(a => a.severity).join(', ')})`);
    
    // Show detailed results for financial alerts
    const financialAlerts = [...nsfAlerts, ...balanceAlerts, ...negativeDaysAlerts];
    if (financialAlerts.length > 0) {
        console.log('\n🚨 Financial Alert Details:');
        financialAlerts.forEach((alert, index) => {
            console.log(`${index + 1}. [${alert.severity}] ${alert.code}`);
            console.log(`   ${alert.message}`);
            if (alert.data.nsfCount) console.log(`   NSF Count: ${alert.data.nsfCount}`);
            if (alert.data.averageDailyBalance !== undefined) console.log(`   Avg Balance: $${alert.data.averageDailyBalance}`);
            if (alert.data.negativeDayCount) console.log(`   Negative Days: ${alert.data.negativeDayCount}`);
        });
    }
    
    // Show detailed results for credibility alerts
    const credibilityAlerts = [...revenueAlerts, ...timeAlerts];
    if (credibilityAlerts.length > 0) {
        console.log('\n🚨 Credibility Alert Details:');
        credibilityAlerts.forEach((alert, index) => {
            console.log(`${index + 1}. [${alert.severity}] ${alert.code}`);
            console.log(`   ${alert.message}`);
            if (alert.data.discrepancyPercentage) {
                console.log(`   Revenue Discrepancy: ${alert.data.discrepancyPercentage}%`);
                console.log(`   Stated: $${alert.data.statedAnnualRevenue.toLocaleString()}, Annualized: $${alert.data.annualizedDeposits.toLocaleString()}`);
            }
            if (alert.data.discrepancyMonths) {
                console.log(`   Time Discrepancy: ${alert.data.discrepancyMonths} months`);
                console.log(`   Start: ${new Date(alert.data.statedStartDate).toLocaleDateString()}, Registration: ${new Date(alert.data.officialRegistrationDate).toLocaleDateString()}`);
            }
        });
    }
    
    // Show first few alerts from main method
    console.log('\n📋 First 3 alerts from generateAlerts:');
    alerts.slice(0, 3).forEach((alert, index) => {
        console.log(`${index + 1}. [${alert.severity}] ${alert.code}: ${alert.message}`);
        if (alert.data?.accountIndex) {
            console.log(`   Account: ${alert.data.accountIndex}`);
        }
    });
    
} catch (error) {
    console.error('❌ Error testing refactored method:', error.message);
    console.error(error.stack);
}
