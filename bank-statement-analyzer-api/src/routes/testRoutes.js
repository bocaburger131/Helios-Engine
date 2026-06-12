import express from 'express';
import multer from 'multer';
import storageService from '../services/storageService.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Test file upload endpoint
router.post('/test-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const result = await storageService.uploadFile(req.file, 'test-uploads');
    
    res.json({
      message: 'File uploaded successfully',
      file: result
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

export default router;