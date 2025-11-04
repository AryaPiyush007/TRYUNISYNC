import { NextApiRequest, NextApiResponse } from 'next';

export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends ApiError {
  constructor(message: string = 'External service error') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
    this.name = 'ExternalServiceError';
  }
}

// Error handler middleware
export function handleApiError(error: any, req: NextApiRequest, res: NextApiResponse) {
  // Log the full error for debugging
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  // Handle different types of errors
  if (error instanceof ApiError) {
    // Custom API errors
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((err: any) => ({
      field: err.path,
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    });
  }

  // Handle Mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    const fieldMap: { [key: string]: string } = {
      email: 'Email',
      username: 'Username'
    };

    return res.status(409).json({
      success: false,
      error: `${fieldMap[field] || field} already exists`,
      code: 'DUPLICATE_KEY_ERROR'
    });
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Handle Multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760');
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));

    return res.status(413).json({
      success: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB`,
      code: 'FILE_TOO_LARGE'
    });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: 'Too many files',
      code: 'TOO_MANY_FILES'
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Unexpected file field',
      code: 'UNEXPECTED_FILE'
    });
  }

  // Handle Cloudinary errors
  if (error.message && error.message.includes('Cloudinary')) {
    return res.status(502).json({
      success: false,
      error: 'File upload service unavailable',
      code: 'UPLOAD_SERVICE_ERROR'
    });
  }

  // Handle MongoDB connection errors
  if (error.name === 'MongooseServerSelectionError') {
    return res.status(503).json({
      success: false,
      error: 'Database service unavailable',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  // Handle Redis errors
  if (error.message && error.message.includes('Redis')) {
    // Don't fail the request if Redis is down, just log and continue
    console.warn('Redis service unavailable:', error.message);
    return;
  }

  // Handle generic errors
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && {
      message: error.message,
      stack: error.stack
    })
  });
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: NextApiRequest, res: NextApiResponse) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      handleApiError(error, req, res);
    });
  };
}

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process for unhandled rejections in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});