import security from '../middleware/security.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import logger from '../utils/logger.js';

class SecureFileProcessor {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || 'uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.allowedTypes = ['application/pdf', 'text/plain', 'text/csv'];
    this.processingQueue = new Map();
    this.startCleanupInterval();
  }

  /**
   * Process file securely without storing
   */
  async processFile(file, userId) {
    const fileId = crypto.randomUUID();
    const sessionKey = crypto.randomBytes(32).toString('hex');
    
    try {
      // Log file processing (hash only)
      logger.info(`Processing file: ${SecurityMiddleware.hashForLogging(file.originalname)} for user: ${SecurityMiddleware.hashForLogging(userId)}`);
      
      // Validate file
      const validation = await SecurityMiddleware.validateFileUpload(file);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Encrypt file in memory
      const encryptedData = await SecurityMiddleware.encryptBuffer(file.buffer, sessionKey);
      
      // Store encrypted data temporarily in memory only
      this.processingQueue.set(fileId, {
        encryptedData,
        sessionKey,
        userId,
        timestamp: Date.now(),
        expires: Date.now() + (30 * 60 * 1000) // 30 minutes
      });
      
      // Schedule deletion
      setTimeout(() => this.deleteFile(fileId), 30 * 60 * 1000);
      
      return { fileId, sessionKey };
    } catch (error) {
      logger.error('Secure file processing error:', error);
      throw error;
    }
  }

  /**
   * Retrieve and decrypt file for processing
   */
  async retrieveFile(fileId, sessionKey) {
    const fileData = this.processingQueue.get(fileId);
    
    if (!fileData) {
      throw new Error('File not found or expired');
    }
    
    if (fileData.sessionKey !== sessionKey) {
      logger.warn(`Invalid session key attempt for file: ${fileId}`);
      throw new Error('Invalid session key');
    }
    
    // Decrypt file
    const decryptedBuffer = await SecurityMiddleware.decryptBuffer(
      fileData.encryptedData,
      sessionKey
    );
    
    return decryptedBuffer;
  }

  /**
   * Delete file from memory
   */
  deleteFile(fileId) {
    if (this.processingQueue.has(fileId)) {
      const fileData = this.processingQueue.get(fileId);
      
      // Overwrite memory before deletion
      if (fileData.encryptedData && fileData.encryptedData.encrypted) {
        crypto.randomFillSync(fileData.encryptedData.encrypted);
      }
      
      this.processingQueue.delete(fileId);
      logger.info(`File ${fileId} securely deleted from memory`);
    }
  }

  /**
   * Cleanup expired files
   */
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [fileId, fileData] of this.processingQueue.entries()) {
        if (fileData.expires < now) {
          this.deleteFile(fileId);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  async deleteFile(filename) {
    const filePath = path.join(this.uploadDir, filename);
    await fs.unlink(filePath);
  }

  async getFileStream(filename) {
    const filePath = path.join(this.uploadDir, filename);
    return fs.createReadStream(filePath);
  }
}

export default new SecureFileProcessor();