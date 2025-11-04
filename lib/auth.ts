import jwt from 'jsonwebtoken';
import { NextApiRequest, NextApiResponse } from 'next';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface DecodedToken {
  userId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends NextApiRequest {
  user?: AuthUser;
}

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('Please define the JWT_SECRET environment variable inside .env.local');
}

export const generateToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 days
  );
};

export const verifyToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const requireAuth = (handler: Function) => {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      }

      // Verify token
      const decoded = verifyToken(token);

      // Attach user info to request
      req.user = {
        id: decoded.userId,
        username: '', // Will be populated from database in API routes
        email: ''    // Will be populated from database in API routes
      };

      return await handler(req, res);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired access token'
      });
    }
  };
};

export const optionalAuth = (handler: Function) => {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        if (token) {
          try {
            const decoded = verifyToken(token);
            req.user = {
              id: decoded.userId,
              username: '',
              email: ''
            };
          } catch (error) {
            // Token is invalid, but we continue without authentication
            // This allows the route to work for both authenticated and unauthenticated users
          }
        }
      }

      return await handler(req, res);
    } catch (error) {
      // Continue without authentication if something goes wrong
      return await handler(req, res);
    }
  };
};