import { NextApiRequest, NextApiResponse } from 'next';

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  message: string;  // Error message
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store for development (fallback)
let memoryStore: RateLimitStore = {};

// Redis client setup for production
let redisClient: any = null;

const initRedis = async () => {
  if (process.env.REDIS_URL && !redisClient) {
    try {
      const Redis = require('redis');
      redisClient = Redis.createClient({
        url: process.env.REDIS_URL,
        retry_strategy: (options: any) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          // Retry after min(2^attempt * 100, 3000) milliseconds
          return Math.min(options.attempt * 100, 3000);
        },
      });

      await redisClient.connect();
      console.log('Connected to Redis');
    } catch (error) {
      console.warn('Failed to connect to Redis, using memory store:', error);
      redisClient = null;
    }
  }
};

// Initialize Redis on module load
initRedis();

// Rate limiter function
export const createRateLimiter = (config: RateLimitConfig) => {
  return async (req: NextApiRequest, res: NextApiResponse, next: Function) => {
    // Get identifier (IP address or user ID if authenticated)
    const identifier = req.user?.id || req.connection.remoteAddress || 'unknown';
    const key = `rate_limit:${identifier}:${req.url || 'default'}`;

    try {
      if (redisClient) {
        // Use Redis for distributed rate limiting
        const current = await redisClient.get(key);

        if (!current) {
          // First request in this window
          await redisClient.setEx(key, Math.ceil(config.windowMs / 1000), '1');
          return next();
        }

        const count = parseInt(current);

        if (count >= config.maxRequests) {
          // Rate limit exceeded
          return res.status(429).json({
            success: false,
            error: config.message,
            retryAfter: config.windowMs / 1000
          });
        }

        // Increment counter
        await redisClient.incr(key);
        return next();
      } else {
        // Fallback to memory store
        const now = Date.now();
        const record = memoryStore[key];

        if (!record || now > record.resetTime) {
          // Reset or create new record
          memoryStore[key] = {
            count: 1,
            resetTime: now + config.windowMs
          };
          return next();
        }

        if (record.count >= config.maxRequests) {
          return res.status(429).json({
            success: false,
            error: config.message,
            retryAfter: Math.ceil((record.resetTime - now) / 1000)
          });
        }

        record.count++;
        return next();
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      // If rate limiting fails, allow the request
      return next();
    }
  };
};

// Predefined rate limiters
export const generalLimiter = createRateLimiter({
  windowMs: 60000,  // 1 minute
  maxRequests: 60,  // 60 requests per minute
  message: "Too many requests, please try again later."
});

export const uploadLimiter = createRateLimiter({
  windowMs: 600000,  // 10 minutes
  maxRequests: 5,  // 5 uploads per 10 minutes
  message: "Upload limit exceeded, please wait before uploading again."
});

export const authLimiter = createRateLimiter({
  windowMs: 60000,  // 1 minute
  maxRequests: 5,  // 5 login attempts per minute
  message: "Too many authentication attempts, please try again later."
});

export const commentLimiter = createRateLimiter({
  windowMs: 60000,  // 1 minute
  maxRequests: 10,  // 10 comments per minute
  message: "Comment limit exceeded, please wait before posting again."
});

export const marketplaceLimiter = createRateLimiter({
  windowMs: 3600000,  // 1 hour
  maxRequests: 5,  // 5 new listings per hour
  message: "Marketplace listing limit exceeded, please wait before creating another listing."
});

// Clean up memory store periodically (only used in development)
if (!redisClient) {
  setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, record] of Object.entries(memoryStore)) {
      if (now > record.resetTime) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => delete memoryStore[key]);
  }, 60000); // Clean up every minute
}