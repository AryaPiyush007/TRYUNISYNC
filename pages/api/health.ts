import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { successResponse, errorResponse } from '@/lib/utils';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected' | 'error';
    cloudinary: 'connected' | 'disconnected' | 'error';
    redis?: 'connected' | 'disconnected' | 'error';
  };
  memory: {
    used: string;
    total: string;
    percentage: number;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  const startTime = Date.now();
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'disconnected',
      cloudinary: 'disconnected'
    },
    memory: {
      used: '0 MB',
      total: '0 MB',
      percentage: 0
    }
  };

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  healthStatus.memory = {
    used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
    total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
  };

  try {
    // Check database connection
    await connectDB();
    healthStatus.services.database = 'connected';
  } catch (error) {
    console.error('Database health check failed:', error);
    healthStatus.services.database = 'error';
    healthStatus.status = 'unhealthy';
  }

  // Check Cloudinary configuration
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET) {
      healthStatus.services.cloudinary = 'connected';
    } else {
      healthStatus.services.cloudinary = 'disconnected';
    }
  } catch (error) {
    console.error('Cloudinary health check failed:', error);
    healthStatus.services.cloudinary = 'error';
    healthStatus.status = 'unhealthy';
  }

  // Check Redis connection (if configured)
  if (process.env.REDIS_URL) {
    try {
      const Redis = require('redis');
      const redisClient = Redis.createClient({
        url: process.env.REDIS_URL,
        connectTimeout: 5000,
      });

      await redisClient.ping();
      healthStatus.services.redis = 'connected';
      await redisClient.quit();
    } catch (error) {
      console.error('Redis health check failed:', error);
      healthStatus.services.redis = 'disconnected';
      // Redis failure doesn't make the service unhealthy as it has fallback
    }
  }

  // Set response time
  const responseTime = Date.now() - startTime;
  res.setHeader('X-Response-Time', `${responseTime}ms`);

  // Return health status
  if (healthStatus.status === 'unhealthy') {
    return res.status(503).json({
      success: false,
      error: 'Service unhealthy',
      data: healthStatus
    });
  }

  return successResponse(res, healthStatus, 'Service healthy');
}