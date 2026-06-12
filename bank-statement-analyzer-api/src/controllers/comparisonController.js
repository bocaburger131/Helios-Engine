import logger from '../utils/logger.js';

export class ComparisonController {
  constructor(comparisonService) {
    this.comparisonService = comparisonService;
    logger.info('ComparisonController initialized');
  }

  async compareStatements(req, res) {
    try {
      const { statementIds } = req.body;
      
      if (!statementIds || !Array.isArray(statementIds) || statementIds.length < 2) {
        logger.warn('Invalid request: Missing or invalid statementIds array');
        return res.status(400).json({ 
          success: false, 
          message: 'Please provide at least two statement IDs to compare' 
        });
      }

      const comparison = await this.comparisonService.compareStatements(statementIds);
      logger.info(`Comparison generated for statements: ${statementIds.join(', ')}`);
      
      return res.status(200).json({
        success: true,
        data: comparison
      });
    } catch (error) {
      logger.error(`Error comparing statements: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to compare statements',
        error: error.message
      });
    }
  }

  async getComparisonById(req, res) {
    try {
      const { id } = req.params;
      const comparison = await this.comparisonService.getComparisonById(id);
      
      if (!comparison) {
        logger.warn(`Comparison not found with ID: ${id}`);
        return res.status(404).json({
          success: false,
          message: 'Comparison not found'
        });
      }
      
      logger.info(`Retrieved comparison with ID: ${id}`);
      return res.status(200).json({
        success: true,
        data: comparison
      });
    } catch (error) {
      logger.error(`Error retrieving comparison: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve comparison',
        error: error.message
      });
    }
  }
}

// For compatibility with existing code
export default ComparisonController;