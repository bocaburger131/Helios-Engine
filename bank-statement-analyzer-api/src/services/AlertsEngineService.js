/**
 * Alerts Engine Service
 * 
 * This service analyzes application data, financial insights, and SOS verification
 * data to generate comprehensive alerts for risk assessment and decision making.
 */

import logger from '../utils/logger.js';

class AlertsEngineService {
    
    /**
     * Primary method to generate all alerts
     * @param {Object} applicationData - Business application information
     * @param {Array} finsightReportsArray - Array of FinSight Report objects, one for each bank statement
     * @param {Object} sosData - SOS (Statement of Source) verification data
     * @returns {Array} Consolidated array of alert objects
     */
    static generateAlerts(applicationData, finsightReportsArray, sosData = {}) {
        try {
            logger.info('Starting comprehensive alert generation', {
                hasApplicationData: !!applicationData,
                finsightReportsCount: finsightReportsArray?.length || 0,
                hasSosData: !!sosData && Object.keys(sosData).length > 0
            });

            const alerts = [];

            // Validate input parameters
            if (!Array.isArray(finsightReportsArray) || finsightReportsArray.length === 0) {
                logger.warn('No FinSight reports provided for alert generation');
                return [];
            }

            // Process each FinSight report
            finsightReportsArray.forEach((finsightReport, index) => {
                if (!finsightReport) {
                    logger.warn(`Skipping null/undefined FinSight report at index ${index}`);
                    return;
                }

                logger.info(`Processing FinSight report ${index + 1}/${finsightReportsArray.length}`, {
                    reportId: finsightReport.id || `report_${index}`,
                    hasRiskAnalysis: !!finsightReport.riskAnalysis
                });

                // Generate alerts from each category for this report
                alerts.push(...this._generateNsfAlerts(finsightReport, index));
                alerts.push(...this._generateBalanceAlerts(finsightReport, index));
                alerts.push(...this._generateVelocityAlerts(finsightReport, index));
                alerts.push(...this._generateIncomeStabilityAlerts(finsightReport, index));
                alerts.push(...this._generateCashFlowAlerts(finsightReport, index));
                alerts.push(...this._generateDepositPatternAlerts(finsightReport, index));
                alerts.push(...this._generateWithdrawalPatternAlerts(finsightReport, index));
                alerts.push(...this._generateCreditRiskAlerts(finsightReport, index));
                alerts.push(...this._generateComplianceAlerts(applicationData, finsightReport, index));
                alerts.push(...this._generateDataQualityAlerts(applicationData, finsightReport, index));
                alerts.push(...this._generateFraudIndicatorAlerts(finsightReport, index));
                alerts.push(...this._generateDebtServiceAlerts(applicationData, finsightReport, index));
                alerts.push(...this._generateIndustrySpecificAlerts(applicationData, finsightReport, index));
            });

            // Generate cross-report analysis alerts
            alerts.push(...this._generateCrossReportAnalysisAlerts(finsightReportsArray));
            
            // Verify annual revenue against projected Gross Annual Revenue from statements
            alerts.push(...this._verifyAnnualRevenue(applicationData, finsightReportsArray));
            
            // Generate business verification alerts using provided SOS data
            if (sosData && Object.keys(sosData).length > 0) {
                alerts.push(...this._generateBusinessVerificationAlerts(sosData));
                alerts.push(...this._verifyTimeInBusiness(applicationData, sosData));
            } else {
                // Fallback: Extract SOS data from the first report (if available)
                const reportSosData = finsightReportsArray[0]?.sosData;
                if (reportSosData) {
                    alerts.push(...this._generateBusinessVerificationAlerts(reportSosData));
                }
            }

            // Deduplicate alerts (remove duplicates based on code and severity)
            const deduplicatedAlerts = this._deduplicateAlerts(alerts);

            // Sort alerts by severity (CRITICAL first, then HIGH, MEDIUM, LOW)
            const severityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
            deduplicatedAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            logger.info('Alert generation completed', {
                totalAlertsBeforeDedup: alerts.length,
                totalAlertsAfterDedup: deduplicatedAlerts.length,
                duplicatesRemoved: alerts.length - deduplicatedAlerts.length,
                criticalCount: deduplicatedAlerts.filter(a => a.severity === 'CRITICAL').length,
                highCount: deduplicatedAlerts.filter(a => a.severity === 'HIGH').length,
                mediumCount: deduplicatedAlerts.filter(a => a.severity === 'MEDIUM').length,
                lowCount: deduplicatedAlerts.filter(a => a.severity === 'LOW').length
            });

            return deduplicatedAlerts;

        } catch (error) {
            logger.error('Error generating alerts:', error);
            return [{
                code: 'ALERT_GENERATION_ERROR',
                severity: 'HIGH',
                message: 'Failed to generate comprehensive alerts due to system error',
                data: {
                    error: error.message,
                    timestamp: new Date().toISOString()
                },
                timestamp: new Date()
            }];
        }
    }

    /**
     * New primary method to generate alerts with the requested signature
     * @param {Object} applicationData - Main application/statement data
     * @param {Array} finsightReportsArray - Array of finsight report data  
     * @param {Object} sosData - SOS (Statement of Source) verification data
     * @returns {Array} Consolidated array of alert objects
     */
    static generateAlertsCustom(applicationData, finsightReportsArray = [], sosData = {}) {
        const alerts = [];
        
        try {
            // Validate input data
            if (!applicationData || typeof applicationData !== 'object') {
                logger.warn('AlertsEngineService: Invalid applicationData provided');
                return alerts;
            }
            
            logger.info('🚨 AlertsEngineService: Starting alert generation with requested signature...');
            
            // Generate alerts from different check methods
            const nsfAlerts = this._checkHighNsfCount(applicationData);
            const balanceAlerts = this._checkLowAverageBalance(applicationData);
            const negativeDaysAlerts = this._checkNegativeBalanceDays(applicationData);
            
            // Generate credibility alerts
            const revenueAlerts = this._verifyAnnualRevenue(applicationData, finsightReportsArray);
            const timeInBusinessAlerts = this._verifyTimeInBusiness(applicationData, sosData);
            
            // Consolidate all alerts
            alerts.push(...nsfAlerts);
            alerts.push(...balanceAlerts);
            alerts.push(...negativeDaysAlerts);
            alerts.push(...revenueAlerts);
            alerts.push(...timeInBusinessAlerts);
            
            logger.info(`🚨 AlertsEngineService: Generated ${alerts.length} alerts`);
            
            // Sort alerts by severity (CRITICAL > HIGH > MEDIUM > LOW)
            return this._sortAlertsBySeverity(alerts);
            
        } catch (error) {
            logger.error('AlertsEngineService: Error generating alerts:', error);
            return alerts;
        }
    }

    /**
     * Generate alerts based on cross-report analysis
     * @param {Array} finsightReportsArray - Array of FinSight reports
     * @private
     */
    static _generateCrossReportAnalysisAlerts(finsightReportsArray) {
        const alerts = [];
        
        if (!Array.isArray(finsightReportsArray) || finsightReportsArray.length < 2) {
            return alerts;
        }

        try {
            // Analyze consistency across reports
            const nsfCounts = finsightReportsArray.map(report => report?.riskAnalysis?.nsfCount || 0);
            const avgBalances = finsightReportsArray.map(report => report?.riskAnalysis?.avgDailyBalance || 0);
            const riskScores = finsightReportsArray.map(report => report?.riskAnalysis?.riskScore || 0);

            // Check for inconsistent NSF patterns across accounts
            const maxNsf = Math.max(...nsfCounts);
            const minNsf = Math.min(...nsfCounts);
            if (maxNsf - minNsf > 3) {
                alerts.push({
                    code: 'INCONSISTENT_NSF_PATTERNS',
                    severity: 'MEDIUM',
                    message: `Inconsistent NSF patterns across bank accounts (range: ${minNsf}-${maxNsf})`,
                    data: {
                        nsfCounts,
                        maxNsf,
                        minNsf,
                        accountCount: finsightReportsArray.length
                    },
                    timestamp: new Date()
                });
            }

            // Check for significant balance discrepancies
            const avgBalance = avgBalances.reduce((sum, bal) => sum + bal, 0) / avgBalances.length;
            const balanceVariance = avgBalances.some(balance => Math.abs(balance - avgBalance) > avgBalance * 0.5);
            if (balanceVariance && avgBalance > 0) {
                alerts.push({
                    code: 'BALANCE_INCONSISTENCY',
                    severity: 'MEDIUM',
                    message: 'Significant balance variations detected across bank accounts',
                    data: {
                        avgBalances,
                        overallAverage: Math.round(avgBalance * 100) / 100,
                        accountCount: finsightReportsArray.length
                    },
                    timestamp: new Date()
                });
            }

            // Check for high-risk concentration
            const highRiskReports = riskScores.filter(score => score > 70).length;
            if (highRiskReports > finsightReportsArray.length / 2) {
                alerts.push({
                    code: 'MULTI_ACCOUNT_HIGH_RISK',
                    severity: 'HIGH',
                    message: `Majority of bank accounts (${highRiskReports}/${finsightReportsArray.length}) show high risk indicators`,
                    data: {
                        riskScores,
                        highRiskCount: highRiskReports,
                        totalAccounts: finsightReportsArray.length
                    },
                    timestamp: new Date()
                });
            }

        } catch (error) {
            logger.error('Error in cross-report analysis:', error);
        }

        return alerts;
    }

    /**
     * Verify annual revenue against projected Gross Annual Revenue from bank statements
     * @param {Object} applicationData - Business application information containing statedAnnualRevenue
     * @param {Array} finsightReportsArray - Array of FinSight Report objects
     * @returns {Array} Array of alert objects
     * @private
     */
    static _verifyAnnualRevenue(applicationData, finsightReportsArray) {
        const alerts = [];
        
        try {
            // Validate input parameters
            if (!applicationData?.statedAnnualRevenue || !Array.isArray(finsightReportsArray) || finsightReportsArray.length === 0) {
                logger.debug('Skipping annual revenue verification - missing required data');
                return alerts;
            }

            const statedAnnualRevenue = parseFloat(applicationData.statedAnnualRevenue);
            if (isNaN(statedAnnualRevenue) || statedAnnualRevenue <= 0) {
                logger.warn('Invalid statedAnnualRevenue provided:', applicationData.statedAnnualRevenue);
                return alerts;
            }

            logger.info('Starting annual revenue verification', {
                statedAnnualRevenue,
                reportsCount: finsightReportsArray.length
            });

            // Collect all transactions from all reports
            let allTransactions = [];
            let totalDeposits = 0;
            let validReportsCount = 0;

            finsightReportsArray.forEach((report, index) => {
                if (!report?.transactions || !Array.isArray(report.transactions)) {
                    logger.warn(`Report ${index + 1} has no valid transactions array`);
                    return;
                }

                // Filter deposits (positive amounts)
                const deposits = report.transactions.filter(t => t.amount > 0 && t.date);
                
                if (deposits.length > 0) {
                    allTransactions.push(...deposits);
                    const reportDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
                    totalDeposits += reportDeposits;
                    validReportsCount++;
                    
                    logger.debug(`Report ${index + 1}: ${deposits.length} deposits totaling $${reportDeposits.toFixed(2)}`);
                }
            });

            if (allTransactions.length === 0) {
                logger.warn('No valid deposit transactions found across all reports');
                return alerts;
            }

            // Find earliest and latest transaction dates to determine time period
            const transactionDates = allTransactions
                .map(t => new Date(t.date))
                .filter(date => !isNaN(date.getTime()));

            if (transactionDates.length === 0) {
                logger.warn('No valid transaction dates found');
                return alerts;
            }

            const earliestDate = new Date(Math.min(...transactionDates));
            const latestDate = new Date(Math.max(...transactionDates));
            
            // Calculate the time period in days
            const timePeriodDays = Math.max(1, (latestDate - earliestDate) / (1000 * 60 * 60 * 24));
            
            // Annualize the deposits (project to 365 days)
            const projectedGrossAnnualRevenue = (totalDeposits / timePeriodDays) * 365;
            
            // Calculate discrepancy percentage
            const discrepancyAmount = Math.abs(projectedGrossAnnualRevenue - statedAnnualRevenue);
            const discrepancyPercentage = (discrepancyAmount / statedAnnualRevenue) * 100;

            logger.info('Annual revenue analysis completed', {
                totalDeposits: totalDeposits.toFixed(2),
                timePeriodDays: Math.round(timePeriodDays),
                projectedGAR: projectedGrossAnnualRevenue.toFixed(2),
                statedRevenue: statedAnnualRevenue.toFixed(2),
                discrepancyPercentage: discrepancyPercentage.toFixed(1),
                earliestDate: earliestDate.toISOString().split('T')[0],
                latestDate: latestDate.toISOString().split('T')[0]
            });

            // Generate alert if discrepancy is greater than 20%
            if (discrepancyPercentage > 20) {
                const isProjectedHigher = projectedGrossAnnualRevenue > statedAnnualRevenue;
                
                alerts.push({
                    code: 'ANNUAL_REVENUE_DISCREPANCY',
                    severity: 'HIGH',
                    message: `Significant discrepancy between stated annual revenue ($${statedAnnualRevenue.toLocaleString()}) and projected GAR ($${projectedGrossAnnualRevenue.toLocaleString()}) - ${discrepancyPercentage.toFixed(1)}% difference`,
                    data: {
                        statedAnnualRevenue,
                        projectedGrossAnnualRevenue: Math.round(projectedGrossAnnualRevenue * 100) / 100,
                        discrepancyAmount: Math.round(discrepancyAmount * 100) / 100,
                        discrepancyPercentage: Math.round(discrepancyPercentage * 100) / 100,
                        isProjectedHigher,
                        analysisDetails: {
                            totalDeposits: Math.round(totalDeposits * 100) / 100,
                            timePeriodDays: Math.round(timePeriodDays),
                            transactionCount: allTransactions.length,
                            accountsAnalyzed: validReportsCount,
                            dateRange: {
                                start: earliestDate.toISOString().split('T')[0],
                                end: latestDate.toISOString().split('T')[0]
                            }
                        }
                    },
                    timestamp: new Date()
                });
            } else {
                // Log successful verification for transparency
                logger.info(`Annual revenue verification passed - discrepancy within acceptable range (${discrepancyPercentage.toFixed(1)}%)`);
            }

        } catch (error) {
            logger.error('Error in annual revenue verification:', error);
            
            // Add error alert
            alerts.push({
                code: 'REVENUE_VERIFICATION_ERROR',
                severity: 'MEDIUM',
                message: 'Unable to verify annual revenue due to data processing error',
                data: {
                    error: error.message,
                    timestamp: new Date().toISOString()
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate NSF (Non-Sufficient Funds) related alerts
     * @param {Object} finsightReport - FinSight report for a single bank statement
     * @param {number} reportIndex - Index of the report in the array (optional)
     * @private
     */
    static _generateNsfAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.riskAnalysis) return alerts;

        const { nsfCount, totalNsfFees, nsfFrequency } = finsightReport.riskAnalysis;

        // High NSF Count: Generate 'HIGH' severity alert if nsfCount is 3 or more
        if (nsfCount >= 3) {
            const alert = this._createHighNsfCountAlert(nsfCount, totalNsfFees, nsfFrequency, reportIndex, finsightReport);
            alerts.push(alert);
        }

        return alerts;
    }

    /**
     * Create High NSF Count Alert
     * @param {number} nsfCount - Number of NSF transactions
     * @param {number} totalNsfFees - Total NSF fees
     * @param {string} nsfFrequency - NSF frequency pattern
     * @param {number} reportIndex - Report index
     * @param {Object} finsightReport - FinSight report
     * @returns {Object} Alert object
     * @private
     */
    static _createHighNsfCountAlert(nsfCount, totalNsfFees, nsfFrequency, reportIndex, finsightReport) {
        logger.info(`Generating HIGH NSF alert: ${nsfCount} NSF transactions detected (threshold: 3)`, {
            accountIndex: reportIndex + 1,
            nsfCount,
            totalFees: totalNsfFees || 0
        });

        return {
            code: 'HIGH_NSF_COUNT',
            severity: 'HIGH',
            title: 'High NSF Count Detected',
            message: `Account ${reportIndex + 1} has ${nsfCount} Non-Sufficient Funds incidents, indicating potential cash flow issues.`,
            recommendation: 'Review account management practices and consider overdraft protection to prevent future NSF incidents.',
            data: {
                accountIndex: reportIndex + 1,
                accountId: finsightReport.id || `account_${reportIndex + 1}`,
                nsfCount,
                threshold: 3,
                totalNsfFees: totalNsfFees || 0,
                averageFeeAmount: nsfCount > 0 ? (totalNsfFees || 0) / nsfCount : 0,
                frequency: nsfFrequency || 'unknown',
                riskLevel: 'HIGH',
                impactLevel: 'high',
                tags: ['nsf', 'cash_flow', 'high_risk']
            },
            context: {
                value: nsfCount,
                threshold: 3,
                exceedsThreshold: true,
                riskCategory: 'cash_flow_management'
            },
            timestamp: new Date()
        };
    }

    /**
     * Generate balance-related alerts
     * @param {Object} finsightReport - FinSight report for a single bank statement
     * @param {number} reportIndex - Index of the report in the array (optional)
     * @private
     */
    static _generateBalanceAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.riskAnalysis) return alerts;

        const { averageBalance, averageDailyBalance, minimumBalance, daysBelow100, negativeBalanceDays } = finsightReport.riskAnalysis;

        // Low Average Balance: Generate 'MEDIUM' severity alert if averageDailyBalance is below $500
        const avgBalance = averageDailyBalance || averageBalance;
        if (avgBalance !== undefined && avgBalance < 500) {
            const alert = this._createLowAverageBalanceAlert(avgBalance, minimumBalance, reportIndex, finsightReport);
            alerts.push(alert);
        }

        // Negative Balance Days: Generate 'CRITICAL' severity alert if account had any days with negative balance
        const hasNegativeBalanceDays = this._checkForNegativeBalanceDays(minimumBalance, negativeBalanceDays, finsightReport);
        if (hasNegativeBalanceDays) {
            const alert = this._createNegativeBalanceDaysAlert(minimumBalance, negativeBalanceDays, reportIndex, finsightReport);
            alerts.push(alert);
        }

        return alerts;
    }

    /**
     * Create Low Average Balance Alert
     * @param {number} avgBalance - Average daily balance
     * @param {number} minimumBalance - Minimum balance
     * @param {number} reportIndex - Report index
     * @param {Object} finsightReport - FinSight report
     * @returns {Object} Alert object
     * @private
     */
    static _createLowAverageBalanceAlert(avgBalance, minimumBalance, reportIndex, finsightReport) {
        logger.info(`Generating MEDIUM average balance alert: $${avgBalance.toFixed(2)} (threshold: $500)`, {
            accountIndex: reportIndex + 1,
            averageBalance: avgBalance,
            threshold: 500
        });

        return {
            code: 'LOW_AVERAGE_BALANCE',
            severity: 'MEDIUM',
            title: 'Low Average Daily Balance',
            message: `Account ${reportIndex + 1}: Average daily balance of $${avgBalance.toFixed(2)} is below the recommended minimum of $500.`,
            recommendation: 'Consider strategies to increase account balance such as automatic savings transfers or budget adjustments to maintain higher cash reserves.',
            data: {
                accountIndex: reportIndex + 1,
                accountId: finsightReport.id || `account_${reportIndex + 1}`,
                averageDailyBalance: avgBalance,
                threshold: 500,
                shortfall: 500 - avgBalance,
                minimumBalance: minimumBalance || 0,
                riskLevel: 'MEDIUM',
                impactLevel: 'medium',
                tags: ['balance', 'cash_management', 'medium_risk']
            },
            context: {
                value: avgBalance,
                threshold: 500,
                belowThreshold: true,
                riskCategory: 'liquidity_management'
            },
            timestamp: new Date()
        };
    }

    /**
     * Check for negative balance days
     * @param {number} minimumBalance - Minimum balance
     * @param {number} negativeBalanceDays - Number of negative balance days
     * @param {Object} finsightReport - FinSight report
     * @returns {boolean} True if negative balance days detected
     * @private
     */
    static _checkForNegativeBalanceDays(minimumBalance, negativeBalanceDays, finsightReport) {
        // Check multiple sources for negative balance indication
        if (negativeBalanceDays > 0) return true;
        if (minimumBalance !== undefined && minimumBalance < 0) return true;
        
        // Check for other indicators in the report
        const riskAnalysis = finsightReport.riskAnalysis || {};
        if (riskAnalysis.hasNegativeBalances) return true;
        if (riskAnalysis.overdraftDays > 0) return true;
        
        return false;
    }

    /**
     * Create Negative Balance Days Alert
     * @param {number} minimumBalance - Minimum balance
     * @param {number} negativeBalanceDays - Number of negative balance days
     * @param {number} reportIndex - Report index
     * @param {Object} finsightReport - FinSight report
     * @returns {Object} Alert object
     * @private
     */
    static _createNegativeBalanceDaysAlert(minimumBalance, negativeBalanceDays, reportIndex, finsightReport) {
        const daysCount = negativeBalanceDays || 0;
        const minBalance = minimumBalance || 0;
        
        logger.info(`Generating CRITICAL negative balance alert: ${daysCount} negative days, minimum balance: $${minBalance.toFixed(2)}`, {
            accountIndex: reportIndex + 1,
            negativeBalanceDays: daysCount,
            minimumBalance: minBalance
        });

        return {
            code: 'NEGATIVE_BALANCE_DAYS',
            severity: 'CRITICAL',
            title: 'Negative Balance Detected',
            message: daysCount > 0 
                ? `Account ${reportIndex + 1}: Account had negative balances for ${daysCount} day(s), indicating severe cash flow issues.`
                : `Account ${reportIndex + 1}: Account experienced negative balance periods (minimum balance: $${minBalance.toFixed(2)}), indicating severe cash flow issues.`,
            recommendation: 'Immediate attention required. Review all transactions, consider overdraft protection, and implement strict budget controls to prevent future overdrafts.',
            data: {
                accountIndex: reportIndex + 1,
                accountId: finsightReport.id || `account_${reportIndex + 1}`,
                negativeBalanceDays: daysCount,
                minimumBalance: minBalance,
                overdraftAmount: minBalance < 0 ? Math.abs(minBalance) : 0,
                threshold: 0,
                riskLevel: 'CRITICAL',
                impactLevel: 'critical',
                urgency: 'immediate',
                tags: ['negative_balance', 'overdraft', 'critical_risk', 'cash_flow']
            },
            context: {
                value: daysCount > 0 ? daysCount : Math.abs(minBalance),
                threshold: 0,
                exceedsThreshold: true,
                riskCategory: 'severe_cash_flow_issues'
            },
            timestamp: new Date()
        };
    }

    /**
     * Generate velocity-related alerts
     * @private
     */
    static _generateVelocityAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.riskAnalysis) return alerts;

        const { velocityRatio, totalDeposits, averageBalance } = finsightReport.riskAnalysis;

        if (velocityRatio !== undefined && velocityRatio > 2.0) {
            let severity = 'MEDIUM';
            let message = `Velocity ratio of ${velocityRatio.toFixed(2)} indicates high transaction turnover`;

            if (velocityRatio > 5.0) {
                severity = 'CRITICAL';
                message = `Extremely high velocity ratio: ${velocityRatio.toFixed(2)} suggests potential money laundering`;
            } else if (velocityRatio > 3.5) {
                severity = 'HIGH';
                message = `Very high velocity ratio: ${velocityRatio.toFixed(2)} indicates unusual activity`;
            }

            alerts.push({
                code: 'HIGH_VELOCITY_RATIO',
                severity,
                message,
                data: {
                    velocityRatio,
                    totalDeposits: totalDeposits || 0,
                    averageBalance: averageBalance || 0,
                    turnoverRate: velocityRatio,
                    benchmarkRatio: 2.0
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate income stability alerts
     * @private
     */
    static _generateIncomeStabilityAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.incomeStability) return alerts;

        const { stabilityScore, regularIncome, incomeVariability } = finsightReport.incomeStability;

        if (stabilityScore !== undefined && stabilityScore < 70) {
            let severity = 'LOW';
            let message = `Income stability score of ${stabilityScore} indicates irregular income patterns`;

            if (stabilityScore < 40) {
                severity = 'HIGH';
                message = `Very low income stability: Score ${stabilityScore} indicates highly irregular income`;
            } else if (stabilityScore < 55) {
                severity = 'MEDIUM';
                message = `Low income stability: Score ${stabilityScore} suggests income irregularity`;
            }

            alerts.push({
                code: 'INCOME_INSTABILITY',
                severity,
                message,
                data: {
                    stabilityScore,
                    regularIncome: regularIncome || false,
                    incomeVariability: incomeVariability || 'unknown',
                    benchmarkScore: 70,
                    improvementNeeded: 70 - stabilityScore
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate cash flow alerts
     * @private
     */
    static _generateCashFlowAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.riskAnalysis) return alerts;

        const { totalDeposits, totalWithdrawals, netCashFlow } = finsightReport.riskAnalysis;

        // Negative cash flow alert
        if (netCashFlow !== undefined && netCashFlow < 0) {
            let severity = 'MEDIUM';
            let message = `Negative cash flow of $${Math.abs(netCashFlow).toFixed(2)}`;

            if (Math.abs(netCashFlow) > 5000) {
                severity = 'HIGH';
                message = `Significant negative cash flow: $${Math.abs(netCashFlow).toFixed(2)}`;
            }

            alerts.push({
                code: 'NEGATIVE_CASH_FLOW',
                severity,
                message,
                data: {
                    netCashFlow,
                    totalDeposits: totalDeposits || 0,
                    totalWithdrawals: totalWithdrawals || 0,
                    cashFlowRatio: totalDeposits > 0 ? netCashFlow / totalDeposits : 0
                },
                timestamp: new Date()
            });
        }

        // High withdrawal to deposit ratio
        if (totalDeposits > 0 && totalWithdrawals > 0) {
            const withdrawalRatio = totalWithdrawals / totalDeposits;
            
            if (withdrawalRatio > 0.9) {
                let severity = withdrawalRatio > 1.1 ? 'HIGH' : 'MEDIUM';
                
                alerts.push({
                    code: 'HIGH_WITHDRAWAL_RATIO',
                    severity,
                    message: `High withdrawal ratio: ${(withdrawalRatio * 100).toFixed(1)}% of deposits`,
                    data: {
                        withdrawalRatio,
                        totalDeposits,
                        totalWithdrawals,
                        excessWithdrawals: totalWithdrawals - totalDeposits
                    },
                    timestamp: new Date()
                });
            }
        }

        return alerts;
    }

    /**
     * Generate deposit pattern alerts
     * @private
     */
    static _generateDepositPatternAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.transactions) return alerts;

        const deposits = finsightReport.transactions.filter(t => t.amount > 0);
        
        if (deposits.length === 0) return alerts;

        // Large deposit analysis
        const largeDeposits = deposits.filter(d => d.amount > 10000);
        if (largeDeposits.length > 0) {
            const totalLargeDeposits = largeDeposits.reduce((sum, d) => sum + d.amount, 0);
            
            let severity = 'MEDIUM';
            if (totalLargeDeposits > 50000 || largeDeposits.length > 3) {
                severity = 'HIGH';
            }

            alerts.push({
                code: 'LARGE_DEPOSIT_PATTERN',
                severity,
                message: `${largeDeposits.length} large deposit(s) totaling $${totalLargeDeposits.toFixed(2)}`,
                data: {
                    largeDepositCount: largeDeposits.length,
                    totalLargeDeposits,
                    largestDeposit: Math.max(...largeDeposits.map(d => d.amount)),
                    averageLargeDeposit: totalLargeDeposits / largeDeposits.length,
                    depositDates: largeDeposits.map(d => d.date)
                },
                timestamp: new Date()
            });
        }

        // Structuring pattern detection (deposits just under $10,000)
        const structuredDeposits = deposits.filter(d => d.amount >= 9000 && d.amount < 10000);
        if (structuredDeposits.length >= 2) {
            alerts.push({
                code: 'POTENTIAL_STRUCTURING',
                severity: 'HIGH',
                message: `${structuredDeposits.length} deposits just under $10,000 detected - potential structuring`,
                data: {
                    structuredCount: structuredDeposits.length,
                    totalStructuredAmount: structuredDeposits.reduce((sum, d) => sum + d.amount, 0),
                    deposits: structuredDeposits.map(d => ({
                        amount: d.amount,
                        date: d.date,
                        description: d.description
                    }))
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate withdrawal pattern alerts
     * @private
     */
    static _generateWithdrawalPatternAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.transactions) return alerts;

        const withdrawals = finsightReport.transactions.filter(t => t.amount < 0);
        
        if (withdrawals.length === 0) return alerts;

        // Large cash withdrawals
        const cashWithdrawals = withdrawals.filter(w => 
            w.description && 
            w.description.toLowerCase().includes('cash') && 
            Math.abs(w.amount) > 2000
        );

        if (cashWithdrawals.length > 0) {
            const totalCashWithdrawals = cashWithdrawals.reduce((sum, w) => sum + Math.abs(w.amount), 0);
            
            let severity = 'MEDIUM';
            if (totalCashWithdrawals > 25000 || cashWithdrawals.length > 5) {
                severity = 'CRITICAL';
            } else if (totalCashWithdrawals > 15000 || cashWithdrawals.length > 3) {
                severity = 'HIGH';
            }

            alerts.push({
                code: 'LARGE_CASH_WITHDRAWALS',
                severity,
                message: `${cashWithdrawals.length} large cash withdrawal(s) totaling $${totalCashWithdrawals.toFixed(2)}`,
                data: {
                    cashWithdrawalCount: cashWithdrawals.length,
                    totalCashWithdrawals,
                    largestCashWithdrawal: Math.max(...cashWithdrawals.map(w => Math.abs(w.amount))),
                    withdrawalDates: cashWithdrawals.map(w => w.date),
                    mlRiskLevel: severity
                },
                timestamp: new Date()
            });
        }

        // Frequent ATM withdrawals
        const atmWithdrawals = withdrawals.filter(w =>
            w.description && 
            (w.description.toLowerCase().includes('atm') || w.description.toLowerCase().includes('withdrawal'))
        );

        if (atmWithdrawals.length > 20) {
            alerts.push({
                code: 'EXCESSIVE_ATM_USAGE',
                severity: 'MEDIUM',
                message: `${atmWithdrawals.length} ATM withdrawals suggest heavy cash usage`,
                data: {
                    atmWithdrawalCount: atmWithdrawals.length,
                    totalAtmAmount: atmWithdrawals.reduce((sum, w) => sum + Math.abs(w.amount), 0),
                    averageAtmAmount: atmWithdrawals.reduce((sum, w) => sum + Math.abs(w.amount), 0) / atmWithdrawals.length,
                    frequency: 'high'
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate business verification alerts
     * @private
     */
    static _generateBusinessVerificationAlerts(sosData) {
        const alerts = [];
        
        if (!sosData) return alerts;

        // Business not found
        if (!sosData.found) {
            alerts.push({
                code: 'BUSINESS_NOT_VERIFIED',
                severity: 'HIGH',
                message: 'Business could not be verified with Secretary of State records',
                data: {
                    searchedName: sosData.businessName,
                    state: sosData.state,
                    verificationAttempted: true,
                    verificationDate: sosData.timestamp
                },
                timestamp: new Date()
            });
        } else {
            // Business found but inactive
            if (!sosData.isActive) {
                alerts.push({
                    code: 'BUSINESS_INACTIVE_STATUS',
                    severity: 'CRITICAL',
                    message: `Business status is '${sosData.status}' - not active`,
                    data: {
                        businessName: sosData.matchedBusinessName,
                        status: sosData.status,
                        registrationDate: sosData.registrationDate,
                        state: sosData.state,
                        verificationDate: sosData.timestamp
                    },
                    timestamp: new Date()
                });
            }

            // Business name mismatch
            if (sosData.matchedBusinessName && sosData.businessName) {
                const similarity = this._calculateSimilarity(sosData.businessName, sosData.matchedBusinessName);
                if (similarity < 0.8) {
                    alerts.push({
                        code: 'BUSINESS_NAME_MISMATCH',
                        severity: 'MEDIUM',
                        message: `Business name mismatch: Applied as '${sosData.businessName}' but registered as '${sosData.matchedBusinessName}'`,
                        data: {
                            appliedName: sosData.businessName,
                            registeredName: sosData.matchedBusinessName,
                            similarity: similarity,
                            registrationDate: sosData.registrationDate
                        },
                        timestamp: new Date()
                    });
                }
            }

            // Recently registered business
            if (sosData.registrationDate) {
                const regDate = new Date(sosData.registrationDate);
                const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
                
                if (monthsOld < 6) {
                    alerts.push({
                        code: 'NEWLY_REGISTERED_BUSINESS',
                        severity: 'MEDIUM',
                        message: `Business registered only ${monthsOld.toFixed(1)} months ago`,
                        data: {
                            registrationDate: sosData.registrationDate,
                            monthsOld: monthsOld,
                            businessAge: 'new'
                        },
                        timestamp: new Date()
                    });
                }
            }
        }

        return alerts;
    }

    /**
     * Generate credit risk alerts
     * @private
     */
    static _generateCreditRiskAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.veritasScore) return alerts;

        const { score, grade, riskLevel } = finsightReport.veritasScore;

        if (score !== undefined) {
            if (score < 30) {
                alerts.push({
                    code: 'VERY_HIGH_CREDIT_RISK',
                    severity: 'CRITICAL',
                    message: `Veritas Score of ${score} indicates very high credit risk`,
                    data: {
                        veritasScore: score,
                        grade: grade || 'F',
                        riskLevel: riskLevel || 'VERY HIGH',
                        recommendation: 'DECLINE'
                    },
                    timestamp: new Date()
                });
            } else if (score < 50) {
                alerts.push({
                    code: 'HIGH_CREDIT_RISK',
                    severity: 'HIGH',
                    message: `Veritas Score of ${score} indicates high credit risk`,
                    data: {
                        veritasScore: score,
                        grade: grade || 'D',
                        riskLevel: riskLevel || 'HIGH',
                        recommendation: 'CAUTION'
                    },
                    timestamp: new Date()
                });
            } else if (score < 70) {
                alerts.push({
                    code: 'MODERATE_CREDIT_RISK',
                    severity: 'MEDIUM',
                    message: `Veritas Score of ${score} indicates moderate credit risk`,
                    data: {
                        veritasScore: score,
                        grade: grade || 'C',
                        riskLevel: riskLevel || 'MODERATE',
                        recommendation: 'REVIEW'
                    },
                    timestamp: new Date()
                });
            }
        }

        return alerts;
    }

    /**
     * Generate compliance alerts
     * @private
     */
    static _generateComplianceAlerts(applicationData, finsightReport, reportIndex = 0) {
        const alerts = [];
        
        // AML/KYC alerts
        if (finsightReport?.riskAnalysis) {
            const { totalDeposits, totalWithdrawals } = finsightReport.riskAnalysis;
            
            // High volume activity requiring enhanced due diligence
            if (totalDeposits > 100000 || totalWithdrawals > 100000) {
                alerts.push({
                    code: 'HIGH_VOLUME_ACTIVITY',
                    severity: 'MEDIUM',
                    message: 'High transaction volume may require enhanced due diligence',
                    data: {
                        totalDeposits: totalDeposits || 0,
                        totalWithdrawals: totalWithdrawals || 0,
                        totalVolume: (totalDeposits || 0) + (totalWithdrawals || 0),
                        enhancedDueDiligenceRequired: true
                    },
                    timestamp: new Date()
                });
            }
        }

        // OFAC/Sanctions screening needed
        if (applicationData?.businessName) {
            // This would integrate with actual OFAC screening
            alerts.push({
                code: 'OFAC_SCREENING_REQUIRED',
                severity: 'MEDIUM',
                message: 'OFAC sanctions screening required for business entity',
                data: {
                    businessName: applicationData.businessName,
                    screeningRequired: true,
                    complianceCheck: 'pending'
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate data quality alerts
     * @private
     */
    static _generateDataQualityAlerts(applicationData, finsightReport, reportIndex = 0) {
        const alerts = [];
        
        // Missing critical data
        const missingFields = [];
        
        if (!applicationData?.businessName) missingFields.push('business name');
        if (!applicationData?.industry) missingFields.push('industry');
        if (!applicationData?.requestedAmount) missingFields.push('requested amount');
        
        if (missingFields.length > 0) {
            alerts.push({
                code: 'INCOMPLETE_APPLICATION_DATA',
                severity: 'MEDIUM',
                message: `Missing critical application data: ${missingFields.join(', ')}`,
                data: {
                    missingFields,
                    dataCompleteness: ((5 - missingFields.length) / 5) * 100,
                    reviewRequired: true
                },
                timestamp: new Date()
            });
        }

        const sosData = finsightReport?.sosData;
        
        // Data inconsistencies
        if (applicationData?.businessName && sosData?.matchedBusinessName) {
            const similarity = this._calculateSimilarity(applicationData.businessName, sosData.matchedBusinessName);
            if (similarity < 0.6) {
                alerts.push({
                    code: 'DATA_INCONSISTENCY',
                    severity: 'MEDIUM',
                    message: 'Significant discrepancy between application and verification data',
                    data: {
                        appliedName: applicationData.businessName,
                        verifiedName: sosData.matchedBusinessName,
                        similarity: similarity,
                        requiresReview: true
                    },
                    timestamp: new Date()
                });
            }
        }

        // Insufficient statement data
        if (finsightReport?.transactions && finsightReport.transactions.length < 30) {
            alerts.push({
                code: 'INSUFFICIENT_TRANSACTION_DATA',
                severity: 'MEDIUM',
                message: `Only ${finsightReport.transactions.length} transactions available for analysis`,
                data: {
                    transactionCount: finsightReport.transactions.length,
                    minimumRecommended: 30,
                    dataQuality: 'insufficient'
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate fraud indicator alerts
     * @private
     */
    static _generateFraudIndicatorAlerts(finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!finsightReport?.transactions) return alerts;

        const transactions = finsightReport.transactions;
        
        // Round number transaction pattern
        const roundAmounts = transactions.filter(t => t.amount % 100 === 0 && Math.abs(t.amount) >= 1000);
        if (roundAmounts.length > transactions.length * 0.3) {
            alerts.push({
                code: 'SUSPICIOUS_ROUND_AMOUNTS',
                severity: 'MEDIUM',
                message: `${roundAmounts.length} transactions with round amounts may indicate manipulation`,
                data: {
                    roundAmountCount: roundAmounts.length,
                    totalTransactions: transactions.length,
                    percentage: (roundAmounts.length / transactions.length * 100).toFixed(1),
                    examples: roundAmounts.slice(0, 5)
                },
                timestamp: new Date()
            });
        }

        // Unusual timing patterns
        const weekendTransactions = transactions.filter(t => {
            const date = new Date(t.date);
            const day = date.getDay();
            return day === 0 || day === 6; // Sunday or Saturday
        });

        if (weekendTransactions.length > transactions.length * 0.2) {
            alerts.push({
                code: 'UNUSUAL_TIMING_PATTERN',
                severity: 'LOW',
                message: `High percentage of weekend transactions may indicate unusual activity`,
                data: {
                    weekendTransactionCount: weekendTransactions.length,
                    totalTransactions: transactions.length,
                    weekendPercentage: (weekendTransactions.length / transactions.length * 100).toFixed(1)
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate debt service alerts
     * @private
     */
    static _generateDebtServiceAlerts(applicationData, finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!applicationData?.requestedAmount || !finsightReport?.riskAnalysis?.netCashFlow) {
            return alerts;
        }

        const monthlyPayment = applicationData.requestedAmount * 0.1 / 12; // Rough estimate
        const netCashFlow = finsightReport.riskAnalysis.netCashFlow;
        const debtServiceRatio = monthlyPayment / Math.max(netCashFlow, 1);

        if (debtServiceRatio > 0.4) {
            let severity = 'MEDIUM';
            if (debtServiceRatio > 0.6) severity = 'HIGH';
            if (debtServiceRatio > 0.8) severity = 'CRITICAL';

            alerts.push({
                code: 'HIGH_DEBT_SERVICE_RATIO',
                severity,
                message: `Estimated debt service ratio of ${(debtServiceRatio * 100).toFixed(1)}% may strain cash flow`,
                data: {
                    requestedAmount: applicationData.requestedAmount,
                    estimatedMonthlyPayment: monthlyPayment,
                    netCashFlow,
                    debtServiceRatio,
                    maxRecommendedRatio: 0.4
                },
                timestamp: new Date()
            });
        }

        return alerts;
    }

    /**
     * Generate industry-specific alerts
     * @private
     */
    static _generateIndustrySpecificAlerts(applicationData, finsightReport, reportIndex = 0) {
        const alerts = [];
        
        if (!applicationData?.industry) return alerts;

        const industry = applicationData.industry.toLowerCase();
        
        // High-risk industries
        const highRiskIndustries = [
            'cannabis', 'marijuana', 'adult entertainment', 'gambling', 'cryptocurrency',
            'money services', 'pawn shop', 'check cashing', 'payday lending'
        ];

        if (highRiskIndustries.some(risk => industry.includes(risk))) {
            alerts.push({
                code: 'HIGH_RISK_INDUSTRY',
                severity: 'HIGH',
                message: `Business operates in high-risk industry: ${applicationData.industry}`,
                data: {
                    industry: applicationData.industry,
                    riskLevel: 'high',
                    additionalDueDiligenceRequired: true,
                    specialCompliance: true
                },
                timestamp: new Date()
            });
        }

        // Cash-intensive industries
        const cashIntensiveIndustries = [
            'restaurant', 'retail', 'convenience store', 'gas station', 'bar', 'nightclub'
        ];

        if (cashIntensiveIndustries.some(cash => industry.includes(cash))) {
            const { velocityRatio } = finsightReport?.riskAnalysis || {};
            
            if (velocityRatio && velocityRatio > 4.0) {
                alerts.push({
                    code: 'CASH_INTENSIVE_HIGH_VELOCITY',
                    severity: 'MEDIUM',
                    message: `High velocity ratio ${velocityRatio.toFixed(2)} in cash-intensive industry requires review`,
                    data: {
                        industry: applicationData.industry,
                        velocityRatio,
                        industryType: 'cash-intensive',
                        reviewRequired: true
                    },
                    timestamp: new Date()
                });
            }
        }

        return alerts;
    }

    /**
     * Calculate string similarity (simple implementation)
     * @private
     */
    static _calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @private
     */
    static _levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Get alert summary statistics
     */
    static getAlertSummary(alerts) {
        return {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'CRITICAL').length,
            high: alerts.filter(a => a.severity === 'HIGH').length,
            medium: alerts.filter(a => a.severity === 'MEDIUM').length,
            low: alerts.filter(a => a.severity === 'LOW').length,
            categories: this._categorizeAlerts(alerts)
        };
    }

    /**
     * Categorize alerts by type
     * @private
     */
    static _categorizeAlerts(alerts) {
        const categories = {};
        
        alerts.forEach(alert => {
            const category = this._getAlertCategory(alert.code);
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(alert);
        });
        
        return categories;
    }

    /**
     * Get alert category from code
     * @private
     */
    static _getAlertCategory(code) {
        if (code.includes('NSF')) return 'NSF & Overdrafts';
        if (code.includes('BALANCE')) return 'Balance Issues';
        if (code.includes('VELOCITY')) return 'Transaction Velocity';
        if (code.includes('INCOME')) return 'Income Stability';
        if (code.includes('CASH_FLOW') || code.includes('WITHDRAWAL')) return 'Cash Flow';
        if (code.includes('DEPOSIT')) return 'Deposit Patterns';
        if (code.includes('BUSINESS')) return 'Business Verification';
        if (code.includes('RISK') || code.includes('CREDIT')) return 'Credit Risk';
        if (code.includes('COMPLIANCE') || code.includes('OFAC')) return 'Compliance';
        if (code.includes('DATA')) return 'Data Quality';
        if (code.includes('FRAUD') || code.includes('SUSPICIOUS')) return 'Fraud Indicators';
        if (code.includes('DEBT')) return 'Debt Service';
        if (code.includes('INDUSTRY')) return 'Industry Risk';
        return 'Other';
    }

    /**
     * Private method: Check for high NSF (Non-Sufficient Funds) count
     * @param {Object} applicationData - Application data containing NSF information
     * @returns {Array} Array of NSF-related alerts
     */
    static _checkHighNsfCount(applicationData) {
        const alerts = [];
        
        try {
            // Extract NSF data from different possible locations
            const nsfCount = applicationData?.nsfAnalysis?.nsfCount 
                || applicationData?.analysis?.nsfAnalysis?.nsfCount
                || applicationData?.summary?.nsfCount
                || 0;
            
            const nsfTransactions = applicationData?.nsfAnalysis?.nsfTransactions 
                || applicationData?.analysis?.nsfAnalysis?.nsfTransactions
                || [];
            
            // Check if NSF count meets alert threshold (3 or more)
            if (nsfCount >= 3) {
                alerts.push({
                    code: 'HIGH_NSF_COUNT',
                    severity: 'HIGH',
                    message: `Account has ${nsfCount} Non-Sufficient Funds (NSF) incidents, indicating potential cash flow issues and financial instability.`,
                    data: {
                        nsfCount: nsfCount,
                        nsfTransactions: nsfTransactions.map(tx => ({
                            date: tx.date,
                            amount: tx.amount,
                            description: tx.description,
                            fee: tx.fee || null
                        })),
                        threshold: 3,
                        riskLevel: nsfCount >= 5 ? 'CRITICAL' : 'HIGH'
                    },
                    timestamp: new Date()
                });
                
                logger.info(`🚨 HIGH_NSF_COUNT alert generated: ${nsfCount} NSF incidents`);
            }
            
        } catch (error) {
            logger.error('AlertsEngineService: Error checking NSF count:', error);
        }
        
        return alerts;
    }
    
    /**
     * Private method: Check for low average balance
     * @param {Object} applicationData - Application data containing balance information  
     * @returns {Array} Array of low balance alerts
     */
    static _checkLowAverageBalance(applicationData) {
        const alerts = [];
        
        try {
            // Extract average balance from different possible locations
            const averageDailyBalance = applicationData?.balanceAnalysis?.averageBalance
                || applicationData?.analysis?.balanceAnalysis?.averageDailyBalance
                || applicationData?.summary?.averageDailyBalance
                || applicationData?.financialSummary?.averageDailyBalance
                || null;
            
            const threshold = 500; // $500 threshold as requested
            
            // Check if average balance is below threshold
            if (averageDailyBalance !== null && averageDailyBalance < threshold) {
                alerts.push({
                    code: 'LOW_AVERAGE_BALANCE',
                    severity: 'MEDIUM',
                    message: `Average daily balance of $${averageDailyBalance.toFixed(2)} is below the recommended minimum of $${threshold}, which may indicate limited financial cushion.`,
                    data: {
                        averageDailyBalance: averageDailyBalance,
                        threshold: threshold,
                        shortfall: threshold - averageDailyBalance,
                        balanceCategory: averageDailyBalance < 100 ? 'VERY_LOW' : 'LOW',
                        periodAnalyzed: applicationData?.balanceAnalysis?.periodDays || null
                    },
                    timestamp: new Date()
                });
                
                logger.info(`🚨 LOW_AVERAGE_BALANCE alert generated: $${averageDailyBalance.toFixed(2)} (threshold: $${threshold})`);
            }
            
        } catch (error) {
            logger.error('AlertsEngineService: Error checking average balance:', error);
        }
        
        return alerts;
    }
    
    /**
     * Private method: Check for negative balance days
     * @param {Object} applicationData - Application data containing balance information
     * @returns {Array} Array of negative balance alerts
     */
    static _checkNegativeBalanceDays(applicationData) {
        const alerts = [];
        
        try {
            // Extract balance data from different possible locations
            const balanceAnalysis = applicationData?.balanceAnalysis 
                || applicationData?.analysis?.balanceAnalysis
                || {};
            
            const transactions = applicationData?.transactions || [];
            const dailyBalances = balanceAnalysis?.dailyBalances || [];
            
            // Check for negative balance indicators
            let negativeDays = [];
            let hasNegativeBalance = false;
            
            // Method 1: Check if negative balance days are explicitly tracked
            if (balanceAnalysis.negativeDays && balanceAnalysis.negativeDays.length > 0) {
                negativeDays = balanceAnalysis.negativeDays;
                hasNegativeBalance = true;
            }
            
            // Method 2: Check daily balances array
            else if (dailyBalances.length > 0) {
                negativeDays = dailyBalances.filter(day => day.balance < 0);
                hasNegativeBalance = negativeDays.length > 0;
            }
            
            // Method 3: Look for negative balance transactions or patterns
            else {
                const negativeBalanceTransactions = transactions.filter(tx => 
                    tx.balance && tx.balance < 0
                );
                hasNegativeBalance = negativeBalanceTransactions.length > 0;
                
                if (hasNegativeBalance) {
                    negativeDays = negativeBalanceTransactions.map(tx => ({
                        date: tx.date,
                        balance: tx.balance,
                        transaction: tx.description
                    }));
                }
            }
            
            // Generate alert if negative balance days found
            if (hasNegativeBalance) {
                const dayCount = negativeDays.length;
                
                alerts.push({
                    code: 'NEGATIVE_BALANCE_DAYS',
                    severity: 'CRITICAL', // Always CRITICAL as requested
                    message: `Account had ${dayCount} day(s) with negative balance, indicating serious cash flow problems and potential overdraft issues.`,
                    data: {
                        negativeDayCount: dayCount,
                        negativeDays: negativeDays.slice(0, 10), // Limit to first 10 for data size
                        totalDaysAnalyzed: balanceAnalysis.periodDays || null,
                        worstBalance: Math.min(...negativeDays.map(day => day.balance || 0)),
                        riskLevel: 'CRITICAL',
                        recommendation: 'Immediate attention required for cash flow management'
                    },
                    timestamp: new Date()
                });
                
                logger.info(`🚨 NEGATIVE_BALANCE_DAYS alert generated: ${dayCount} negative days`);
            }
            
        } catch (error) {
            logger.error('AlertsEngineService: Error checking negative balance days:', error);
        }
        
        return alerts;
    }
    
    /**
     * Private method: Verify annual revenue discrepancy
     * @param {Object} applicationData - Application data containing stated annual revenue
     * @param {Array} finsightReportsArray - Array of finsight reports with deposit data
     * @returns {Array} Array of revenue verification alerts
     */
    static _verifyAnnualRevenue(applicationData, finsightReportsArray = []) {
        const alerts = [];
        
        try {
            // Extract stated annual revenue from application
            const statedAnnualRevenue = applicationData?.statedAnnualRevenue 
                || applicationData?.annualRevenue
                || applicationData?.grossAnnualRevenue
                || applicationData?.application?.annualRevenue
                || null;
            
            if (!statedAnnualRevenue || statedAnnualRevenue <= 0) {
                logger.warn('No stated annual revenue found for verification');
                return alerts;
            }
            
            if (!Array.isArray(finsightReportsArray) || finsightReportsArray.length === 0) {
                logger.warn('No finsight reports provided for revenue verification');
                return alerts;
            }
            
            // Calculate total deposits from all reports
            let totalDeposits = 0;
            let totalDaysAnalyzed = 0;
            let reportDetails = [];
            
            finsightReportsArray.forEach((report, index) => {
                if (report && report.analysis) {
                    const deposits = report.analysis.totalDeposits 
                        || report.analysis.financialSummary?.totalDeposits
                        || report.totalDeposits
                        || 0;
                    
                    const days = report.analysis.balanceAnalysis?.periodDays
                        || report.periodDays
                        || 30; // Default to 30 days if not specified
                    
                    totalDeposits += deposits;
                    totalDaysAnalyzed += days;
                    
                    reportDetails.push({
                        reportIndex: index + 1,
                        deposits: deposits,
                        periodDays: days
                    });
                }
            });
            
            if (totalDeposits <= 0 || totalDaysAnalyzed <= 0) {
                logger.warn('No valid deposit data found for revenue verification');
                return alerts;
            }
            
            // Annualize the deposits (average daily deposits * 365)
            const averageDailyDeposits = totalDeposits / totalDaysAnalyzed;
            const annualizedDeposits = averageDailyDeposits * 365;
            
            // Calculate discrepancy percentage
            const discrepancy = Math.abs(statedAnnualRevenue - annualizedDeposits);
            const discrepancyPercentage = (discrepancy / statedAnnualRevenue) * 100;
            
            // Generate alert if discrepancy > 20%
            if (discrepancyPercentage > 20) {
                const isOverstated = statedAnnualRevenue > annualizedDeposits;
                
                alerts.push({
                    code: 'GROSS_ANNUAL_REVENUE_MISMATCH',
                    severity: 'HIGH',
                    message: `Stated annual revenue of $${statedAnnualRevenue.toLocaleString()} ${isOverstated ? 'exceeds' : 'is below'} annualized deposits of $${annualizedDeposits.toLocaleString()} by ${discrepancyPercentage.toFixed(1)}%, indicating potential revenue misrepresentation.`,
                    data: {
                        statedAnnualRevenue: statedAnnualRevenue,
                        annualizedDeposits: Math.round(annualizedDeposits),
                        discrepancy: Math.round(discrepancy),
                        discrepancyPercentage: Math.round(discrepancyPercentage * 100) / 100,
                        isOverstated: isOverstated,
                        analysisDetails: {
                            totalDeposits: totalDeposits,
                            totalDaysAnalyzed: totalDaysAnalyzed,
                            averageDailyDeposits: Math.round(averageDailyDeposits),
                            reportCount: finsightReportsArray.length,
                            reportDetails: reportDetails
                        },
                        threshold: 20,
                        riskLevel: 'HIGH',
                        recommendation: 'Request additional documentation to verify actual revenue figures'
                    },
                    timestamp: new Date()
                });
                
                logger.info(`🚨 GROSS_ANNUAL_REVENUE_MISMATCH alert generated: ${discrepancyPercentage.toFixed(1)}% discrepancy`);
            }
            
        } catch (error) {
            logger.error('AlertsEngineService: Error verifying annual revenue:', error);
        }
        
        return alerts;
    }
    
    /**
     * Private method: Verify time in business discrepancy
     * @param {Object} applicationData - Application data containing business start date
     * @param {Object} sosData - SOS data containing official registration date
     * @returns {Array} Array of time in business verification alerts
     */
    static _verifyTimeInBusiness(applicationData, sosData = {}) {
        const alerts = [];
        
        try {
            // Extract business start date from application
            const businessStartDate = applicationData?.businessStartDate
                || applicationData?.startDate
                || applicationData?.dateStarted
                || applicationData?.application?.businessStartDate
                || null;
            
            // Extract registration date from SOS data
            const registrationDate = sosData?.registrationDate
                || sosData?.incorporationDate
                || sosData?.filingDate
                || sosData?.establishedDate
                || null;
            
            if (!businessStartDate) {
                logger.warn('No business start date found for verification');
                return alerts;
            }
            
            if (!registrationDate) {
                logger.warn('No registration date found in SOS data for verification');
                return alerts;
            }
            
            // Convert to Date objects if they're strings
            const startDate = new Date(businessStartDate);
            const regDate = new Date(registrationDate);
            
            // Validate dates
            if (isNaN(startDate.getTime()) || isNaN(regDate.getTime())) {
                logger.warn('Invalid date format in business verification data');
                return alerts;
            }
            
            // Compare only month and year as requested
            const startMonthYear = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const regMonthYear = new Date(regDate.getFullYear(), regDate.getMonth(), 1);
            
            // Calculate month difference
            const monthsDifference = (startMonthYear.getTime() - regMonthYear.getTime()) / (1000 * 60 * 60 * 24 * 30.44); // Average days per month
            
            // Generate alert if stated start date is more than 3 months earlier than registration
            if (monthsDifference < -3) {
                const absMonthsDiff = Math.abs(monthsDifference);
                
                alerts.push({
                    code: 'TIME_IN_BUSINESS_DISCREPANCY',
                    severity: 'HIGH',
                    message: `Stated business start date (${startDate.toLocaleDateString()}) is ${absMonthsDiff.toFixed(1)} months earlier than official registration date (${regDate.toLocaleDateString()}), suggesting potential misrepresentation of business longevity.`,
                    data: {
                        statedStartDate: businessStartDate,
                        officialRegistrationDate: registrationDate,
                        statedStartDateParsed: startDate.toISOString(),
                        registrationDateParsed: regDate.toISOString(),
                        monthsDifference: Math.round(monthsDifference * 10) / 10,
                        discrepancyMonths: Math.round(absMonthsDiff * 10) / 10,
                        comparisonMethod: 'month_and_year_only',
                        threshold: 3,
                        riskLevel: 'HIGH',
                        recommendation: 'Verify actual business start date with additional documentation'
                    },
                    timestamp: new Date()
                });
                
                logger.info(`🚨 TIME_IN_BUSINESS_DISCREPANCY alert generated: ${absMonthsDiff.toFixed(1)} months discrepancy`);
            }
            
        } catch (error) {
            logger.error('AlertsEngineService: Error verifying time in business:', error);
        }
        
        return alerts;
    }
    
    /**
     * Private method: Sort alerts by severity level
     * @param {Array} alerts - Array of alert objects
     * @returns {Array} Sorted array with highest severity first
     */
    static _sortAlertsBySeverity(alerts) {
        const severityOrder = {
            'CRITICAL': 4,
            'HIGH': 3,
            'MEDIUM': 2,
            'LOW': 1
        };
        
        return alerts.sort((a, b) => {
            const aSeverity = severityOrder[a.severity] || 0;
            const bSeverity = severityOrder[b.severity] || 0;
            return bSeverity - aSeverity; // Descending order (highest first)
        });
    }

    /**
     * Deduplicate alerts based on code and severity
     * Keeps the most recent alert for each unique code+severity combination
     * 
     * @param {Array} alerts - Array of alert objects
     * @returns {Array} Deduplicated array of alerts
     * @private
     */
    static _deduplicateAlerts(alerts) {
        if (!alerts || alerts.length === 0) return [];

        const seen = new Map();
        const deduplicated = [];

        for (const alert of alerts) {
            // Create unique key based on code and severity
            const key = `${alert.code}_${alert.severity}`;

            if (!seen.has(key)) {
                seen.set(key, true);
                deduplicated.push(alert);
            } else {
                // If duplicate, merge data if possible (keep more comprehensive version)
                const existingIndex = deduplicated.findIndex(
                    a => a.code === alert.code && a.severity === alert.severity
                );

                if (existingIndex !== -1) {
                    const existing = deduplicated[existingIndex];
                    
                    // Merge data arrays if both alerts have them
                    if (alert.data && existing.data) {
                        // If the new alert has more detailed data, replace
                        if (JSON.stringify(alert.data).length > JSON.stringify(existing.data).length) {
                            deduplicated[existingIndex] = alert;
                        }
                    }
                }

                logger.debug(`Deduplicating alert: ${alert.code} (${alert.severity})`);
            }
        }

        return deduplicated;
    }

    /**
     * Enhance alert with actionable recommendations
     * Adds specific, actionable recommendations based on alert type
     * 
     * @param {Object} alert - Alert object
     * @returns {Object} Enhanced alert with recommendations
     * @private
     */
    static _enhanceAlertWithRecommendations(alert) {
        if (alert.recommendation) return alert; // Already has recommendation

        const recommendations = {
            'HIGH_NSF_COUNT': 'Contact client to discuss overdraft protection options and review cash flow management strategies. Consider reducing funding amount or requiring additional reserves.',
            'LOW_AVERAGE_BALANCE': 'Evaluate client\'s ability to maintain minimum operating cash. Request recent bank statements to confirm improvement. Consider requiring business to build reserves before funding.',
            'NEGATIVE_BALANCE_DAYS': 'IMMEDIATE ACTION REQUIRED: Schedule call with client to understand cash flow issues. May indicate business is not viable for funding. Request detailed explanation and corrective action plan.',
            'ANNUAL_REVENUE_DISCREPANCY': 'Request tax returns (Schedule C or 1120) to verify actual revenue. Compare with bank deposits and investigate any significant discrepancies. May need to adjust funding amount.',
            'TIME_IN_BUSINESS_DISCREPANCY': 'Verify business start date with formation documents (Articles of Incorporation, EIN letter). Confirm with client and update application if needed.',
            'BUSINESS_NOT_VERIFIED': 'Contact client to verify business legal name and formation state. Request certificate of good standing or formation documents.',
            'HIGH_WITHDRAWAL_RATIO': 'Analyze withdrawal patterns to determine if business is cash-intensive. Request explanation for high withdrawal activity. Consider industry norms.',
            'LARGE_CASH_WITHDRAWALS': 'Request explanation for large cash withdrawals. Verify legitimate business purpose. May indicate cash-intensive operation or potential AML concern.',
            'POTENTIAL_STRUCTURING': 'FLAG FOR COMPLIANCE REVIEW: Multiple deposits just under $10,000 may indicate structuring to avoid reporting requirements. Escalate to compliance team.',
            'HIGH_VELOCITY_RATIO': 'Analyze transaction patterns to determine if velocity is appropriate for business type. Request explanation if unusual. May indicate pass-through account.',
            'BUSINESS_INACTIVE_STATUS': 'CRITICAL: Do not fund. Business is not in good standing with state. Require client to reinstate business before proceeding.',
            'HIGH_RISK_INDUSTRY': 'Apply enhanced due diligence procedures. Review industry-specific risk factors. May require higher pricing or additional collateral.',
            'NEGATIVE_CASH_FLOW': 'Evaluate sustainability of business operations. Request profit & loss statement. Consider if funding will improve or worsen cash flow situation.'
        };

        if (recommendations[alert.code]) {
            alert.recommendation = recommendations[alert.code];
        }

        return alert;
    }
}

export default AlertsEngineService;
