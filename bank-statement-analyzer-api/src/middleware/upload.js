import multer from 'multer';

// Configure storage
const storage = multer.memoryStorage();

// File filter for CSV files
const fileFilter = (req, file, cb) => {
  // Check file extension
  const isValidExtension = file.originalname.toLowerCase().endsWith('.csv');
  
  // Check MIME type
  const isValidMimeType = file.mimetype === 'text/csv' || 
                         file.mimetype === 'application/vnd.ms-excel' ||
                         file.mimetype === 'text/plain'; // Some systems report CSV as text/plain
  
  if (isValidExtension) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only CSV files are allowed');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export default upload;