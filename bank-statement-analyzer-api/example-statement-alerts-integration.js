/**
 * Example: Using Alerts in Statement Analysis
 * 
 * This example shows how to integrate the new alerts schema
 * into your existing statement analysis workflow.
 */

import mongoose from 'mongoose';
import Statement from './src/models/Statement.js';

/**
 * Example service for generating alerts based on statement analysis
 */
class StatementAlertService {
    
    /**
     * Analyze a statement and generate appropriate alerts
     */
    static generateAlerts(analysisData) {
        const alerts = [];
        
        // NSF Alert Analysis
        if (analysisData.nsfCount > 3) {
            alerts.push({
                code: 'HIGH_NSF_COUNT',
                severity: analysisData.nsfCount > 5 ? 'CRITICAL' : 'HIGH',
                message: `Account has ${analysisData.nsfCount} NSF transactions, indicating potential cash flow issues`,
                data: {
                    nsfCount: analysisData.nsfCount,
                    totalNsfFees: analysisData.totalNsfFees,
                    avgNsfFeeAmount: analysisData.avgNsfFeeAmount,
                    monthlyNsfTrend: analysisData.monthlyNsfTrend
                }
            });
        }
        
        // Low Balance Alert
        if (analysisData.averageBalance < 500) {
            alerts.push({
                code: 'LOW_AVERAGE_BALANCE',
                severity: analysisData.averageBalance < 100 ? 'HIGH' : 'MEDIUM',
                message: `Average account balance of $${analysisData.averageBalance.toFixed(2)} is concerning`,
                data: {
                    averageBalance: analysisData.averageBalance,
                    minimumBalance: analysisData.minimumBalance,
                    daysBelow100: analysisData.daysBelow100,
                    balanceTrend: analysisData.balanceTrend
                }
            });
        }
        
        // High Velocity Alert
        if (analysisData.velocityRatio > 2.0) {
            alerts.push({
                code: 'HIGH_VELOCITY_RATIO',
                severity: analysisData.velocityRatio > 3.0 ? 'CRITICAL' : 'HIGH',
                message: `Velocity ratio of ${analysisData.velocityRatio.toFixed(2)} indicates high transaction turnover`,
                data: {
                    velocityRatio: analysisData.velocityRatio,
                    totalDeposits: analysisData.totalDeposits,
                    averageBalance: analysisData.averageBalance,
                    depositFrequency: analysisData.depositFrequency
                }
            });
        }
        
        // Large Cash Withdrawals
        if (analysisData.largeCashWithdrawals && analysisData.largeCashWithdrawals.length > 0) {
            const totalCashAmount = analysisData.largeCashWithdrawals.reduce((sum, w) => sum + w.amount, 0);
            if (totalCashAmount > 10000) {
                alerts.push({
                    code: 'LARGE_CASH_WITHDRAWALS',
                    severity: totalCashAmount > 25000 ? 'CRITICAL' : 'HIGH',
                    message: `Large cash withdrawals totaling $${totalCashAmount.toFixed(2)} detected`,
                    data: {
                        totalCashAmount,
                        withdrawalCount: analysisData.largeCashWithdrawals.length,
                        largestWithdrawal: Math.max(...analysisData.largeCashWithdrawals.map(w => w.amount)),
                        withdrawalDates: analysisData.largeCashWithdrawals.map(w => w.date),
                        suspiciousTransactionIds: analysisData.largeCashWithdrawals.map(w => w.transactionId)
                    }
                });
            }
        }
        
        // Unusual Deposit Patterns
        if (analysisData.unusualDeposits && analysisData.unusualDeposits.length > 0) {
            alerts.push({
                code: 'UNUSUAL_DEPOSIT_PATTERN',
                severity: 'MEDIUM',
                message: `Detected ${analysisData.unusualDeposits.length} unusual deposit patterns`,
                data: {
                    unusualDepositCount: analysisData.unusualDeposits.length,
                    patterns: analysisData.unusualDeposits.map(d => ({
                        type: d.type,
                        amount: d.amount,
                        frequency: d.frequency,
                        description: d.description
                    })),
                    totalUnusualAmount: analysisData.unusualDeposits.reduce((sum, d) => sum + d.amount, 0)
                }
            });
        }
        
        // Income Stability Issues
        if (analysisData.incomeStability && analysisData.incomeStability.score < 70) {
            alerts.push({
                code: 'INCOME_INSTABILITY',
                severity: analysisData.incomeStability.score < 50 ? 'HIGH' : 'MEDIUM',
                message: `Income stability score of ${analysisData.incomeStability.score} indicates irregular income`,
                data: {
                    stabilityScore: analysisData.incomeStability.score,
                    incomeVariability: analysisData.incomeStability.variability,
                    missedPayPeriods: analysisData.incomeStability.missedPayPeriods,
                    averageIncomeAmount: analysisData.incomeStability.averageAmount,
                    incomeFrequency: analysisData.incomeStability.frequency
                }
            });
        }
        
        // Risk Score Alert
        if (analysisData.riskScore > 70) {
            alerts.push({
                code: 'HIGH_RISK_SCORE',
                severity: analysisData.riskScore > 85 ? 'CRITICAL' : 'HIGH',
                message: `Overall risk score of ${analysisData.riskScore} indicates high financial risk`,
                data: {
                    riskScore: analysisData.riskScore,
                    riskLevel: analysisData.riskLevel,
                    riskFactors: analysisData.riskFactors,
                    contributingMetrics: analysisData.contributingMetrics
                }
            });
        }
        
        return alerts;
    }
    
    /**
     * Update statement with generated alerts
     */
    static async updateStatementWithAlerts(statementId, analysisData) {
        try {
            const alerts = this.generateAlerts(analysisData);
            
            const statement = await Statement.findByIdAndUpdate(
                statementId,
                { 
                    $set: { alerts },
                    $currentDate: { updatedAt: true }
                },
                { new: true }
            );
            
            return {
                success: true,
                statement,
                alertsGenerated: alerts.length,
                criticalAlerts: alerts.filter(a => a.severity === 'CRITICAL').length,
                highAlerts: alerts.filter(a => a.severity === 'HIGH').length
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get statements with specific alert types
     */
    static async getStatementsWithAlerts(alertCode, severity = null) {
        const query = {
            'alerts.code': alertCode
        };
        
        if (severity) {
            query['alerts.severity'] = severity;
        }
        
        return await Statement.find(query)
            .select('accountNumber bankName statementDate alerts')
            .lean();
    }
    
    /**
     * Get alert summary across all statements
     */
    static async getAlertSummary() {
        const pipeline = [
            { $unwind: '$alerts' },
            {
                $group: {
                    _id: {
                        code: '$alerts.code',
                        severity: '$alerts.severity'
                    },
                    count: { $sum: 1 },
                    latestAlert: { $max: '$alerts.timestamp' }
                }
            },
            {
                $group: {
                    _id: '$_id.code',
                    severityBreakdown: {
                        $push: {
                            severity: '$_id.severity',
                            count: '$count'
                        }
                    },
                    totalCount: { $sum: '$count' },
                    latestAlert: { $max: '$latestAlert' }
                }
            },
            { $sort: { totalCount: -1 } }
        ];
        
        return await Statement.aggregate(pipeline);
    }
}

// Example usage demonstration
async function demonstrateAlertsIntegration() {
    console.log('🚨 Statement Alerts Integration Demo');
    console.log('====================================\n');
    
    // Sample analysis data that might come from your risk analysis service
    const sampleAnalysisData = {
        nsfCount: 6,
        totalNsfFees: 210.00,
        avgNsfFeeAmount: 35.00,
        monthlyNsfTrend: 'increasing',
        averageBalance: 75.50,
        minimumBalance: -125.00,
        daysBelow100: 18,
        balanceTrend: 'declining',
        velocityRatio: 3.2,
        totalDeposits: 8500.00,
        depositFrequency: 'irregular',
        largeCashWithdrawals: [
            { amount: 3000, date: '2025-07-10', transactionId: 'tx001' },
            { amount: 5000, date: '2025-07-15', transactionId: 'tx002' },
            { amount: 2500, date: '2025-07-18', transactionId: 'tx003' }
        ],
        incomeStability: {
            score: 45,
            variability: 'high',
            missedPayPeriods: 2,
            averageAmount: 2800.00,
            frequency: 'bi-weekly'
        },
        riskScore: 88,
        riskLevel: 'HIGH',
        riskFactors: ['high_nsf', 'low_balance', 'cash_withdrawals', 'income_instability'],
        contributingMetrics: {
            nsfImpact: 25,
            balanceImpact: 20,
            velocityImpact: 18,
            incomeImpact: 15,
            cashImpact: 10
        }
    };
    
    console.log('📋 Step 1: Generating alerts from analysis data...');
    const alerts = StatementAlertService.generateAlerts(sampleAnalysisData);
    
    console.log(`✅ Generated ${alerts.length} alerts:`);
    alerts.forEach((alert, index) => {
        console.log(`   ${index + 1}. [${alert.severity}] ${alert.code}: ${alert.message.substring(0, 60)}...`);
    });
    
    console.log('\n📋 Step 2: Creating statement with alerts...');
    const testStatement = new Statement({
        userId: new mongoose.Types.ObjectId(),
        accountNumber: 'DEMO123456789',
        bankName: 'Demo Bank',
        statementDate: new Date(),
        fileName: 'demo-statement.pdf',
        fileUrl: '/uploads/demo-statement.pdf',
        openingBalance: 500.00,
        closingBalance: 75.50,
        alerts: alerts
    });
    
    // Validate without saving
    const validationError = testStatement.validateSync();
    if (validationError) {
        console.log('❌ Validation failed:', validationError.message);
        return;
    }
    
    console.log('✅ Statement with alerts created and validated');
    
    console.log('\n📊 Alert Analysis:');
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
    const highAlerts = alerts.filter(a => a.severity === 'HIGH');
    const mediumAlerts = alerts.filter(a => a.severity === 'MEDIUM');
    
    console.log(`   - Critical: ${criticalAlerts.length}`);
    console.log(`   - High: ${highAlerts.length}`);
    console.log(`   - Medium: ${mediumAlerts.length}`);
    
    if (criticalAlerts.length > 0) {
        console.log('\n🚨 CRITICAL ALERTS:');
        criticalAlerts.forEach(alert => {
            console.log(`   - ${alert.code}: ${alert.message}`);
            console.log(`     Data: ${JSON.stringify(alert.data, null, 6).substring(0, 100)}...`);
        });
    }
    
    console.log('\n📋 Step 3: Integration examples...');
    
    console.log('\n// Example: Add alerts to existing statement analysis:');
    console.log('const analysisResult = await riskAnalysisService.analyzeStatement(statement);');
    console.log('const alerts = StatementAlertService.generateAlerts(analysisResult);');
    console.log('statement.alerts = alerts;');
    console.log('await statement.save();');
    
    console.log('\n// Example: Query statements by alert type:');
    console.log('const highNsfStatements = await Statement.find({');
    console.log('  "alerts.code": "HIGH_NSF_COUNT",');
    console.log('  "alerts.severity": { $in: ["HIGH", "CRITICAL"] }');
    console.log('});');
    
    console.log('\n// Example: Filter alerts in API response:');
    console.log('const criticalAlerts = statement.alerts.filter(');
    console.log('  alert => alert.severity === "CRITICAL"');
    console.log(');');
    console.log('res.json({');
    console.log('  statement,');
    console.log('  criticalAlerts,');
    console.log('  alertSummary: {');
    console.log('    total: statement.alerts.length,');
    console.log('    critical: criticalAlerts.length');
    console.log('  }');
    console.log('});');
    
    console.log('\n✅ Alerts integration demo completed!');
}

// Run the demonstration
demonstrateAlertsIntegration()
    .then(() => {
        console.log('\n🎉 Demo completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Demo failed:', error);
        process.exit(1);
    });

export { StatementAlertService };
