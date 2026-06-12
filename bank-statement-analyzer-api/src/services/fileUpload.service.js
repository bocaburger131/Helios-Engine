import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/errors.js';

export class FileUploadService {
  constructor(options = {}) {
    this.uploadDir = options.uploadDir || path.join(process.cwd(), 'uploads');
    this.allowedTypes = options.allowedTypes || ['application/pdf'];
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }
  
  /**
   * Store an uploaded file
   * @param {Object} file - The uploaded file (e.g., from multer)
   * @param {String} userId - ID of the user uploading the file
   * @returns {Object} File metadata including path
   */
  async storeFile(file, userId) {
    // Validate file
    if (!file) throw new AppError('No file provided', 400);
    if (!this.allowedTypes.includes(file.mimetype)) {
      throw new AppError(`Invalid file type. Allowed types: ${this.allowedTypes.join(', ')}`, 400);
    }
    if (file.size > this.maxSize) {
      throw new AppError(`File too large. Maximum size: ${this.maxSize / (1024 * 1024)}MB`, 400);
    }
    
    // Generate unique filename
    const fileId = uuidv4();
    const fileExt = path.extname(file.originalname);
    const fileName = `${fileId}${fileExt}`;
    const filePath = path.join(this.uploadDir, fileName);
    
    // Create user-specific subdirectory
    const userDir = path.join(this.uploadDir, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    const userFilePath = path.join(userDir, fileName);
    
    // Move the file
    await fs.promises.copyFile(file.path, userFilePath);
    await fs.promises.unlink(file.path); // Remove temp file
    
    return {
      id: fileId,
      originalName: file.originalname,
      fileName,
      path: userFilePath,
      size: file.size,
      mimeType: file.mimetype,
      uploadDate: new Date()
    };
  }
  
  /**
   * Remove a file
   * @param {String} filePath - Path to the file
   */
  async removeFile(filePath) {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export const fileUploadService = new FileUploadService();