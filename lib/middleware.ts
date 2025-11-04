import { NextApiRequest, NextApiResponse } from 'next';
import Cors from 'cors';

// Initialize CORS middleware
const cors = Cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow localhost
    if (process.env.NODE_ENV === 'development') {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
    }

    // In production, allow your deployed frontend
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        process.env.NEXT_PUBLIC_API_URL,
        'https://your-domain.vercel.app',
        'https://your-domain.com'
      ].filter(Boolean);

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
});

// Helper method to wrap middleware
export function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

// Security headers middleware
export function addSecurityHeaders(req: NextApiRequest, res: NextApiResponse, next: Function) {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  // Add caching headers for static content
  if (req.url && req.url.includes('/uploads/') || req.url.includes('/images/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
  }

  next();
}

// Request logging middleware
export function logRequest(req: NextApiRequest, res: NextApiResponse, next: Function) {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';

  // Log request start
  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip} - UA: ${userAgent.substring(0, 50)}`);

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    console.log(`[${timestamp}] ${method} ${url} - ${statusCode} - ${duration}ms`);

    originalEnd.call(res, chunk, encoding);
  };

  next();
}

// Content validation middleware
export function validateContentType(req: NextApiRequest, res: NextApiResponse, next: Function) {
  const url = req.url || '';

  // Skip validation for file upload routes
  if (url.includes('/uploads') || url.includes('/marketplace') || url.includes('/events')) {
    return next();
  }

  // For JSON endpoints, check content type
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const contentType = req.headers['content-type'];

    if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      return res.status(415).json({
        success: false,
        error: 'Unsupported Media Type. Please use application/json or multipart/form-data'
      });
    }
  }

  next();
}

// Request size validation
export function validateRequestSize(req: NextApiRequest, res: NextApiResponse, next: Function) {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxRequestSize = parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760'); // 10MB default

  if (contentLength > maxRequestSize) {
    return res.status(413).json({
      success: false,
      error: 'Request entity too large'
    });
  }

  next();
}

// Combine all middleware
export async function applyMiddleware(req: NextApiRequest, res: NextApiResponse, handler: Function) {
  try {
    // Run CORS middleware first
    await runMiddleware(req, res, cors);

    // Apply security headers
    addSecurityHeaders(req, res, () => {});

    // Log request
    logRequest(req, res, () => {});

    // Validate content type
    validateContentType(req, res, () => {});

    // Validate request size
    validateRequestSize(req, res, () => {});

    // Call the actual handler
    return await handler(req, res);
  } catch (error: any) {
    console.error('Middleware error:', error);

    if (error.message === 'Not allowed by CORS') {
      return res.status(403).json({
        success: false,
        error: 'CORS policy violation'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}