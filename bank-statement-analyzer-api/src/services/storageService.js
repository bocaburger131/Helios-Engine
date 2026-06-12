import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class StorageService {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || 'uploads';
  }

  /**
   * Upload a file to local storage
   * @param {Object} file - Multer file object
   * @param {string} folder - Folder path in bucket
   * @returns {Promise<Object>} File metadata
   */
  async uploadFile(file, folder = 'statements') {
    const fileName = `${folder}/${Date.now()}-${uuidv4()}-${file.originalname}`;
    const filePath = path.join(this.uploadDir, fileName);
    
    try {
      await fs.writeFile(filePath, file.buffer);
      
      const fileData = {
        fileName: file.originalname,
        filePath: fileName,
        fileUrl: `/uploads/${fileName}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        storageType: 'local'
      };
      
      logger.info(`File uploaded successfully to local storage: ${fileName}`);
      console.log('✅ File uploaded to local storage:', fileName);
      return fileData;
    } catch (error) {
      logger.error('Error uploading file to local storage:', error);
      console.error('❌ Local storage upload error:', error);
      throw error;
    }
  }

  /**
   * Get a file from local storage
   * @param {string} filePath - File path in storage
   * @returns {Promise<Buffer>} File data
   */
  async getFile(filePath) {
    const fullPath = path.join(this.uploadDir, filePath);
    return await fs.readFile(fullPath);
  }

  /**
   * Delete a file from local storage
   * @param {string} filePath - File path to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(filePath) {
    const fullPath = path.join(this.uploadDir, filePath);
    
    try {
      await fs.unlink(fullPath);
      logger.info(`File deleted successfully: ${filePath}`);
      return true;
    } catch (error) {
      logger.error('Error deleting file from local storage:', error);
      return false;
    }
  }

  /**
   * Check if file exists in local storage
   * @param {string} filePath - File path to check
   * @returns {Promise<boolean>} Exists status
   */
  async fileExists(filePath) {
    const fullPath = path.join(this.uploadDir, filePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage type
   * @returns {string} Current storage type
   */
  getStorageType() {
    return 'Local Storage';
  }
}

export default new StorageService();