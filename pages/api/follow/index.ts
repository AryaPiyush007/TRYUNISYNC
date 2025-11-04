import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { generalLimiter } from '@/lib/rateLimiter';
import { getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import Follow from '@/models/Follow';
import User from '@/models/User';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;

  // Apply rate limiting
  await new Promise((resolve) => generalLimiter(req, res, resolve));

  switch (method) {
    case 'POST':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleFollow(req, res))(req, res);
    case 'DELETE':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleUnfollow(req, res))(req, res);
    case 'GET':
      return handleList(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleFollow(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const { following_id } = req.body;

    if (!following_id) {
      return errorResponse(res, 'Following user ID is required');
    }

    // Prevent self-following
    if (following_id === userId) {
      return errorResponse(res, 'Cannot follow yourself', 400);
    }

    // Connect to database
    await connectDB();

    // Verify target user exists and is active
    const targetUser = await User.findById(following_id);
    if (!targetUser || !targetUser.is_active) {
      return errorResponse(res, 'User not found', 404);
    }

    // Check if already following
    const existingFollow = await Follow.userFollowsUser(userId, following_id);

    if (existingFollow) {
      return successResponse(res, {
        following: true,
        message: 'Already following this user'
      });
    }

    // Create follow relationship
    await Follow.followUser(userId, following_id);

    return successResponse(res, {
      following: true,
      message: 'User followed successfully'
    });

  } catch (error: any) {
    console.error('Follow error:', error);

    // Handle duplicate key error (already following)
    if (error.code === 11000) {
      return successResponse(res, {
        following: true,
        message: 'Already following this user'
      });
    }

    return errorResponse(res, 'Failed to follow user', 500);
  }
}

async function handleUnfollow(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const { following_id } = req.query;

    if (!following_id) {
      return errorResponse(res, 'Following user ID is required');
    }

    if (Array.isArray(following_id)) {
      return errorResponse(res, 'Invalid following ID format');
    }

    // Connect to database
    await connectDB();

    // Check if following relationship exists
    const existingFollow = await Follow.userFollowsUser(userId, following_id);

    if (!existingFollow) {
      return successResponse(res, {
        following: false,
        message: 'Not following this user'
      });
    }

    // Remove follow relationship
    await Follow.unfollowUser(userId, following_id);

    return successResponse(res, {
      following: false,
      message: 'User unfollowed successfully'
    });

  } catch (error) {
    console.error('Unfollow error:', error);
    return errorResponse(res, 'Failed to unfollow user', 500);
  }
}

async function handleList(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const {
      type,
      user_id,
      page,
      limit
    } = req.query;

    if (!user_id || !type) {
      return errorResponse(res, 'User ID and type are required');
    }

    if (!['following', 'followers'].includes(type as string)) {
      return errorResponse(res, 'Type must be either "following" or "followers"');
    }

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    let users;
    let totalItems;

    if (type === 'following') {
      // Get users that this user is following
      users = await Follow.getFollowingList(user_id as string, pageNum, limitNum);
      totalItems = await Follow.getFollowingCount(user_id as string);
    } else {
      // Get users that follow this user
      users = await Follow.getFollowersList(user_id as string, pageNum, limitNum);
      totalItems = await Follow.getFollowersCount(user_id as string);
    }

    // Format response
    const formattedUsers = users.map(follow => {
      const user = type === 'following' ? follow.following_id : follow.follower_id;
      return {
        id: user._id,
        username: user.username,
        avatar_url: user.avatar_url,
        college: user.college,
        bio: user.bio,
        followed_at: follow.created_at
      };
    });

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalItems);

    return successResponse(res, {
      users: formattedUsers,
      pagination,
      type
    });

  } catch (error) {
    console.error('List follows error:', error);
    return errorResponse(res, 'Failed to fetch follow list', 500);
  }
}

export default handler;