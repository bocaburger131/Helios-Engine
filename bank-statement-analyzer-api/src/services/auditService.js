const Audit = require('../models/audit');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

class AuditService {
    async logAnalysisRequest(req, analysisData) {
        try {
            const audit = new Audit({
                requestId: req.id || uuidv4(),
                clientIp: req.ip,
                apiKey: req.headers['x-api-key'],
                endpoint: req.path,
                method: req.method,
                requestBody: {
                    filename: req.file?.originalname,
                    fileSize: req.file?.size
                },
                statementInfo: {
                    accountNumber: analysisData.parsedStatement?.accountInfo?.accountNumber,
                    statementPeriod: analysisData.parsedStatement?.accountInfo?.statementPeriod
                },
                analysisResults: {
                    success: true,
                    source: analysisData.source,
                    patterns: analysisData.analysis?.patterns,
                    recommendations: analysisData.analysis?.recommendations
                }
            });

            await audit.save();
            logger.info(`Audit trail created for request ${audit.requestId}`);
        } catch (error) {
            logger.error('Error creating audit trail:', error);
        }
    }

    async getAnalysisHistory(filters = {}) {
        const query = {};
        
        if (filters.startDate) {
            query.timestamp = { $gte: new Date(filters.startDate) };
        }
        
        if (filters.endDate) {
            query.timestamp = { ...query.timestamp, $lte: new Date(filters.endDate) };
        }
        
        if (filters.apiKey) {
            query.apiKey = filters.apiKey;
        }

        return Audit.find(query)
            .sort({ timestamp: -1 })
            .limit(filters.limit || 100);
    }

    async getUsagePatterns() {
        return Audit.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$timestamp' },
                        month: { $month: '$timestamp' },
                        day: { $dayOfMonth: '$timestamp' }
                    },
                    totalRequests: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$apiKey' },
                    avgResponseTime: { $avg: '$responseTime' },
                    cacheHits: {
                        $sum: { $cond: [{ $eq: ['$analysisResults.source', 'cache'] }, 1, 0] }
                    }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } }
        ]);
    }
}

export default new AuditService();