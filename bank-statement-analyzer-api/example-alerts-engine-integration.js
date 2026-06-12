/**
 * AlertsEngineService Integration Example
 * 
 * This example demonstrates how to integrate the AlertsEngineService
 * with the existing Statement model and save alerts to MongoDB.
 */

import AlertsEngineService from './src/services/AlertsEngineService.js';

// Mock Statement model for demonstration (replace with actual import)
const Statement = {
    // Mock findById method
    findById: async (id) => {
        return {
            _id: id,
            businessName: "Sample Business LLC",
            accountNumber: "****1234",
            alerts: [], // Existing alerts array
            // Mock save method
            save: async function() {
                console.log(`💾 Statement ${this._id} saved with ${this.alerts.length} alerts`);
                return this;
            }
        };
    }
};

/**
 * Enhanced function to process application and generate comprehensive alerts
 */
async function processApplicationWithAlerts(applicationData, finsightReport, sosData, statementId) {
    try {
        console.log('🔄 Processing application with comprehensive alert generation...\n');

        // Step 1: Generate alerts using AlertsEngineService
        console.log('📊 Generating alerts...');
        const generatedAlerts = AlertsEngineService.generateAlerts(
            applicationData,
            finsightReport,
            sosData
        );

        // Step 2: Get alert summary
        const summary = AlertsEngineService.getAlertSummary(generatedAlerts);
        console.log(`✅ Generated ${summary.total} alerts:`);
        console.log(`   🔴 Critical: ${summary.critical}`);
        console.log(`   🟠 High: ${summary.high}`);
        console.log(`   🟡 Medium: ${summary.medium}`);
        console.log(`   🟢 Low: ${summary.low}\n`);

        // Step 3: Convert alerts to Statement model format
        console.log('📝 Converting alerts to Statement model format...');
        const statementAlerts = generatedAlerts.map(alert => ({
            code: alert.code,
            severity: alert.severity,
            message: alert.message,
            data: {
                ...alert.data,
                category: AlertsEngineService._getAlertCategory ? AlertsEngineService._getAlertCategory(alert.code) : 'General',
                generated: true,
                source: 'AlertsEngineService'
            },
            timestamp: alert.timestamp
        }));

        // Step 4: Save alerts to Statement document if statementId provided
        if (statementId) {
            console.log(`💾 Saving alerts to Statement ${statementId}...`);
            const statement = await Statement.findById(statementId);
            
            if (statement) {
                // Add new alerts to existing alerts array
                statement.alerts.push(...statementAlerts);
                await statement.save();
                console.log(`✅ Successfully saved ${statementAlerts.length} alerts to Statement\n`);
            } else {
                console.log(`❌ Statement ${statementId} not found\n`);
            }
        }

        // Step 5: Generate decision recommendation
        const recommendation = generateDecisionRecommendation(summary, generatedAlerts);
        console.log('🎯 DECISION RECOMMENDATION:');
        console.log(`   Decision: ${recommendation.decision}`);
        console.log(`   Confidence: ${recommendation.confidence}%`);
        console.log(`   Risk Level: ${recommendation.riskLevel}`);
        console.log(`   Reasoning: ${recommendation.reasoning}\n`);

        // Step 6: Return comprehensive results
        return {
            alerts: generatedAlerts,
            statementAlerts,
            summary,
            recommendation,
            categories: summary.categories
        };

    } catch (error) {
        console.error('❌ Error processing application with alerts:', error);
        throw error;
    }
}

/**
 * Generate decision recommendation based on alerts
 */
function generateDecisionRecommendation(summary, alerts) {
    let score = 100; // Start with perfect score
    let reasoning = [];

    // Deduct points based on alert severity
    score -= summary.critical * 25; // Critical alerts: -25 points each
    score -= summary.high * 15;     // High alerts: -15 points each
    score -= summary.medium * 8;    // Medium alerts: -8 points each
    score -= summary.low * 3;       // Low alerts: -3 points each

    // Check for specific high-risk alert types
    const criticalAlertCodes = alerts
        .filter(a => a.severity === 'CRITICAL')
        .map(a => a.code);

    const highRiskCodes = [
        'BUSINESS_INACTIVE_STATUS',
        'VERY_HIGH_CREDIT_RISK',
        'EXCESSIVE_NSF_COUNT',
        'HIGH_RISK_INDUSTRY'
    ];

    const hasHighRiskAlert = criticalAlertCodes.some(code => highRiskCodes.includes(code));

    // Determine decision
    let decision, confidence, riskLevel;

    if (score >= 80 && summary.critical === 0) {
        decision = 'APPROVE';
        confidence = Math.min(95, score);
        riskLevel = 'LOW';
        reasoning.push('Low risk profile with minimal alerts');
    } else if (score >= 60 && summary.critical <= 1) {
        decision = 'APPROVE_WITH_CONDITIONS';
        confidence = Math.min(85, score);
        riskLevel = 'MEDIUM';
        reasoning.push('Moderate risk - additional conditions recommended');
    } else if (score >= 40 && !hasHighRiskAlert) {
        decision = 'MANUAL_REVIEW';
        confidence = Math.min(75, score);
        riskLevel = 'HIGH';
        reasoning.push('High risk profile requires manual underwriting review');
    } else {
        decision = 'DECLINE';
        confidence = Math.max(60, 100 - score);
        riskLevel = 'VERY HIGH';
        reasoning.push('Multiple critical risk factors identified');
    }

    // Add specific reasoning based on alert types
    if (summary.critical > 0) {
        reasoning.push(`${summary.critical} critical alert(s) detected`);
    }
    if (summary.high > 3) {
        reasoning.push(`High volume of high-severity alerts (${summary.high})`);
    }
    if (hasHighRiskAlert) {
        reasoning.push('Critical business or credit risk factors present');
    }

    return {
        decision,
        confidence,
        riskLevel,
        reasoning: reasoning.join('; '),
        score,
        alertBreakdown: {
            critical: summary.critical,
            high: summary.high,
            medium: summary.medium,
            low: summary.low
        }
    };
}

/**
 * Example workflow integration
 */
async function exampleWorkflow() {
    console.log('🚀 AlertsEngineService Integration Example\n');
    console.log('=' .repeat(60) + '\n');

    // Sample data
    const applicationData = {
        businessName: "Tech Startup Inc",
        industry: "technology",
        requestedAmount: 75000,
        businessType: "Corporation",
        yearsInBusiness: 1.5,
        annualRevenue: 180000
    };

    const finsightReport = {
        riskAnalysis: {
            nsfCount: 1,
            totalNsfFees: 35,
            averageBalance: 2500,
            minimumBalance: 150,
            daysBelow100: 3,
            velocityRatio: 2.1,
            totalDeposits: 45000,
            totalWithdrawals: 42000,
            netCashFlow: 3000
        },
        incomeStability: {
            stabilityScore: 65,
            regularIncome: true,
            incomeVariability: "moderate"
        },
        veritasScore: {
            score: 68,
            grade: "C+",
            riskLevel: "MEDIUM"
        },
        transactions: Array.from({ length: 45 }, (_, i) => ({
            amount: Math.random() > 0.6 ? Math.floor(Math.random() * 3000) + 200 : -(Math.floor(Math.random() * 1500) + 100),
            date: new Date(2025, 0, i + 1).toISOString().split('T')[0],
            description: "BUSINESS TRANSACTION",
            type: "business"
        }))
    };

    const sosData = {
        found: true,
        isActive: true,
        businessName: "Tech Startup Inc",
        matchedBusinessName: "Tech Startup Inc",
        status: "ACTIVE",
        registrationDate: "2023-06-15",
        state: "CA",
        timestamp: new Date().toISOString()
    };

    // Process application
    const results = await processApplicationWithAlerts(
        applicationData,
        finsightReport,
        sosData,
        "674d1a1e3b7c2a5f8e9d0123" // Mock statement ID
    );

    console.log('📋 DETAILED ALERT BREAKDOWN:');
    Object.entries(results.categories).forEach(([category, categoryAlerts]) => {
        console.log(`\n${category}:`);
        categoryAlerts.forEach(alert => {
            console.log(`   • [${alert.severity}] ${alert.message}`);
        });
    });

    console.log('\n' + '=' .repeat(60));
    console.log('✅ Integration example completed successfully!');
    console.log('\n📄 Next steps:');
    console.log('   1. Import AlertsEngineService into your application controller');
    console.log('   2. Call generateAlerts() after financial analysis');
    console.log('   3. Save results to Statement model alerts array');
    console.log('   4. Use decision recommendation for automated underwriting');
}

// Usage examples
console.log('💡 USAGE EXAMPLES:\n');

console.log('// Basic usage:');
console.log('const alerts = AlertsEngineService.generateAlerts(appData, finsightReport, sosData);');
console.log('');

console.log('// Get summary:');
console.log('const summary = AlertsEngineService.getAlertSummary(alerts);');
console.log('');

console.log('// Integration with Statement model:');
console.log('const statement = await Statement.findById(statementId);');
console.log('statement.alerts.push(...alerts);');
console.log('await statement.save();');
console.log('');

// Run example workflow
exampleWorkflow().catch(console.error);
