import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { generalLimiter } from '@/lib/rateLimiter';
import { successResponse, errorResponse } from '@/lib/utils';
import Like from '@/models/Like';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;

  // Apply rate limiting
  await new Promise((resolve) => generalLimiter(req, res, resolve));

  switch (method) {
    case 'POST':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleLike(req, res))(req, res);
    case 'DELETE':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleUnlike(req, res))(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleLike(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const {
      target_type,
      target_id
    } = req.body;

    // Validate required fields
    if (!target_type || !target_id) {
      return errorResponse(res, 'Target type and target ID are required');
    }

    if (!['upload', 'marketplace_item', 'event'].includes(target_type)) {
      return errorResponse(res, 'Invalid target type');
    }

    // Connect to database
    await connectDB();

    // Check if user already liked this target
    const existingLike = await Like.userLikesTarget(userId, target_type, target_id);

    if (existingLike) {
      // User already liked this content, return current state
      const likeCount = await Like.getLikeCount(target_type, target_id);
      return successResponse(res, {
        liked: true,
        like_count: likeCount,
        message: 'Already liked'
      });
    }

    // Create new like
    await Like.addLike(userId, target_type, target_id);

    // Get updated like count
    const likeCount = await Like.getLikeCount(target_type, target_id);

    return successResponse(res, {
      liked: true,
      like_count: likeCount,
      message: 'Content liked successfully'
    });

  } catch (error: any) {
    console.error('Like error:', error);

    // Handle duplicate key error (user already liked)
    if (error.code === 11000) {
      const likeCount = await Like.getLikeCount(req.body?.target_type, req.body?.target_id);
      return successResponse(res, {
        liked: true,
        like_count: likeCount,
        message: 'Already liked'
      });
    }

    return errorResponse(res, 'Failed to like content', 500);
  }
}

async function handleUnlike(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const {
      target_type,
      target_id
    } = req.query;

    // Validate required query parameters
    if (!target_type || !target_id) {
      return errorResponse(res, 'Target type and target ID are required');
    }

    if (!['upload', 'marketplace_item', 'event'].includes(target_type as string)) {
      return errorResponse(res, 'Invalid target type');
    }

    // Connect to database
    await connectDB();

    // Check if user has liked this target
    const existingLike = await Like.userLikesTarget(userId, target_type as string, target_id as string);

    if (!existingLike) {
      // User hasn't liked this content, return current state
      const likeCount = await Like.getLikeCount(target_type as string, target_id as string);
      return successResponse(res, {
        liked: false,
        like_count: likeCount,
        message: 'Not liked'
      });
    }

    // Remove like
    await Like.removeLike(userId, target_type as string, target_id as string);

    // Get updated like count
    const likeCount = await Like.getLikeCount(target_type as string, target_id as string);

    return successResponse(res, {
      liked: false,
      like_count: likeCount,
      message: 'Content unliked successfully'
    });

  } catch (error) {
    console.error('Unlike error:', error);
    return errorResponse(res, 'Failed to unlike content', 500);
  }
}

export default handler;