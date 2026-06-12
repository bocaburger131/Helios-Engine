import logger from '../utils/logger.js';

class NotificationService {
  async notifyStatementUploaded(userId, statementId, fileName) {
    try {
      // Log the notification (in a real app, this would send an email/push notification)
      logger.info('Notification: Statement uploaded', {
        userId,
        statementId,
        fileName,
        timestamp: new Date().toISOString()
      });
      
      // Here you would typically:
      // 1. Send email notification
      // 2. Send push notification
      // 3. Create in-app notification
      
      return true;
    } catch (error) {
      logger.error('Failed to send notification', error);
      // Don't throw - notifications failing shouldn't break the upload
      return false;
    }
  }

  async notifyProcessingComplete(userId, statementId, status) {
    try {
      logger.info('Notification: Processing complete', {
        userId,
        statementId,
        status,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send notification', error);
      return false;
    }
  }

  async notifyError(userId, statementId, error) {
    try {
      logger.info('Notification: Processing error', {
        userId,
        statementId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send error notification', error);
      return false;
    }
  }
}

// Export singleton instance
export default new NotificationService();