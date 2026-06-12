import { AppError } from '../utils/errors.js';
import Statement from '../models/Statement.js';
import logger from '../utils/logger.js';

export const getAnalysisHistory = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    
    if (!userId) {
      throw new AppError('Authentication required', 401);
    }

    // Build query filters
    const query = { userId };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get total count for pagination
    const total = await Statement.countDocuments(query);
    
    // Get paginated analysis history
    const statements = await Statement.find(query)
      .select('filename createdAt updatedAt analysis status fileSize processingTime')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Transform data for audit view
    const history = statements.map(statement => ({
      id: statement._id,
      filename: statement.filename,
      uploadDate: statement.createdAt,
      lastModified: statement.updatedAt,
      status: statement.status,
      fileSize: statement.fileSize,
      processingTime: statement.processingTime,
      analysisResults: {
        riskLevel: statement.analysis?.riskLevel || 'Not analyzed',
        totalTransactions: statement.analysis?.totalTransactions || 0,
        totalDeposits: statement.analysis?.totalDeposits || 0,
        totalWithdrawals: statement.analysis?.totalWithdrawals || 0,
        nsfCount: statement.analysis?.nsfCount || 0,
        averageBalance: statement.analysis?.averageBalance || 0
      },
      alerts: statement.analysis?.alerts || [],
      verificationStatus: statement.analysis?.verification || 'Pending'
    }));

    res.json({
      status: 'success',
      data: {
        history,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching analysis history:', error);
    next(error);
  }
};

export default {
  getAnalysisHistory
};