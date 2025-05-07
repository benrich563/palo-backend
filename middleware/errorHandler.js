import multer from 'multer';

export const uploadErrorHandler = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File is too large. Maximum size is 5MB'
      });
    }
    return res.status(400).json({
      message: error.message
    });
  }
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  console.error(err);

  // Handle transaction errors
  if (err.name === 'MongoError' && err.errorLabels?.includes('TransactionError')) {
    return res.status(500).json({
      status: 'error',
      message: process.env.NODE_ENV === 'production' 
        ? 'Transaction failed' 
        : 'Transaction failed: ' + err.message,
      code: 'TRANSACTION_ERROR'
    });
  }

  // Get status code from error or default to 500
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
};

