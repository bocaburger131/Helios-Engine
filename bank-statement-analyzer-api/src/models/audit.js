import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
    requestId: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    clientIp: String,
    apiKey: String,
    endpoint: String,
    method: String,
    requestBody: Object,
    responseStatus: Number,
    responseTime: Number,
    statementInfo: {
        accountNumber: String,
        statementPeriod: {
            start: String,
            end: String
        }
    },
    analysisResults: {
        success: Boolean,
        source: String, // 'cache' or 'fresh'
        patterns: Object,
        recommendations: Object
    }
}, {
    timestamps: true
});

const Audit = mongoose.models.Audit || mongoose.model('Audit', auditSchema);
export default Audit;