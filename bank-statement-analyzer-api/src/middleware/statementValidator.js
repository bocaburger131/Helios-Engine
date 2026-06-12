import { AppError } from '../utils/appError.js';

export const statementValidator = (req, res, next) => {
  // Basic validation for file upload
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  const allowedTypes = ['application/pdf', 'text/plain'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Only PDF and text files are allowed.'
    });
  }

  // Check file size
  if (req.file.size > 10 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: 'File size too large. Maximum 10MB allowed'
    });
  }

  // Basic content validation for text files
  if (req.file.mimetype === 'text/plain') {
    const content = req.file.buffer.toString('utf-8');
    
    // Check if it looks like a bank statement
    const bankKeywords = [
      'account number',
      'statement period',
      'beginning balance',
      'ending balance',
      'transaction',
      'deposit',
      'withdrawal'
    ];

    const hasKeywords = bankKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );

    if (!hasKeywords) {
      return res.status(400).json({
        success: false,
        error: 'File does not appear to be a valid bank statement'
      });
    }
  }

  next();
};