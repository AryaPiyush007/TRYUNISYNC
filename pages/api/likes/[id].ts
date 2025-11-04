import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { optionalAuth, AuthenticatedRequest } from '@/lib/auth';
import { successResponse, errorResponse } from '@/lib/utils';
import Like from '@/models/Like';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return errorResponse(res, 'Invalid target ID', 400);
  }

  if (method !== 'GET') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  return optionalAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleCheckLike(req, res, id))(req, res);
};

async function handleCheckLike(req: AuthenticatedRequest, res: NextApiResponse, targetId: string) {
  try {
    const { target_type } = req.query;

    if (!target_type || typeof target_type !== 'string') {
      return errorResponse(res, 'Target type is required', 400);
    }

    if (!['upload', 'marketplace_item', 'event'].includes(target_type)) {
      return errorResponse(res, 'Invalid target type', 400);
    }

    // Connect to database
    await connectDB();

    // Get like count
    const likeCount = await Like.getLikeCount(target_type, targetId);

    // Check if current user liked this content
    let userLiked = false;
    if (req.user?.id) {
      const existingLike = await Like.userLikesTarget(req.user.id, target_type, targetId);
      userLiked = !!existingLike;
    }

    return successResponse(res, {
      target_id: targetId,
      target_type,
      like_count: likeCount,
      user_liked: userLiked
    });

  } catch (error) {
    console.error('Check like status error:', error);
    return errorResponse(res, 'Failed to check like status', 500);
  }
}

export default handler;