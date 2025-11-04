import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { successResponse, errorResponse } from '@/lib/utils';
import User from '@/models/User';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Connect to database
    await connectDB();

    // Find user by ID (excluding password)
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check if user is active
    if (!user.is_active) {
      return errorResponse(res, 'Account is not active', 401);
    }

    // Return user data
    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      bio: user.bio,
      college: user.college,
      year: user.year,
      branch: user.branch,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return successResponse(res, { user: userData });

  } catch (error) {
    console.error('Profile error:', error);
    return errorResponse(res, 'Failed to fetch profile', 500);
  }
};

// Wrap handler with authentication middleware
export default requireAuth(handler);