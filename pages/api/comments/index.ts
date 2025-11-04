import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest, optionalAuth } from '@/lib/auth';
import { commentLimiter, generalLimiter } from '@/lib/rateLimiter';
import { sanitizeString, getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import Comment from '@/models/Comment';
import User from '@/models/User';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;

  // Apply rate limiting based on method
  if (method === 'POST') {
    await new Promise((resolve) => commentLimiter(req, res, resolve));
  } else {
    await new Promise((resolve) => generalLimiter(req, res, resolve));
  }

  switch (method) {
    case 'POST':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleCreate(req, res))(req, res);
    case 'GET':
      return optionalAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleList(req, res))(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleCreate(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const {
      target_type,
      target_id,
      content,
      parent_id
    } = req.body;

    // Validate required fields
    if (!target_type || !target_id || !content) {
      return errorResponse(res, 'Target type, target ID, and content are required');
    }

    if (!['upload', 'marketplace_item', 'event'].includes(target_type)) {
      return errorResponse(res, 'Invalid target type');
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse(res, 'Content is required');
    }

    if (content.length > 1000) {
      return errorResponse(res, 'Content must be less than 1000 characters');
    }

    // Connect to database
    await connectDB();

    // Verify user exists and is active
    const user = await User.findById(userId);
    if (!user || !user.is_active) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    // If parent_id is provided, verify it exists and belongs to the same target
    if (parent_id) {
      const parentComment = await Comment.findById(parent_id);
      if (!parentComment || !parentComment.is_active) {
        return errorResponse(res, 'Parent comment not found', 404);
      }

      if (parentComment.target_type !== target_type || parentComment.target_id.toString() !== target_id) {
        return errorResponse(res, 'Parent comment does not belong to the same target', 400);
      }
    }

    // Create comment
    const comment = new Comment({
      author_id: userId,
      target_type,
      target_id,
      content: sanitizeString(content),
      parent_id: parent_id || null
    });

    await comment.save();

    // Populate author info
    await comment.populate('author_id', 'username avatar_url');

    // Format response
    const commentData = {
      id: comment._id,
      author_id: comment.author_id._id,
      author: comment.author_id ? {
        id: comment.author_id._id,
        username: comment.author_id.username,
        avatar_url: comment.author_id.avatar_url
      } : null,
      target_type: comment.target_type,
      target_id: comment.target_id,
      content: comment.content,
      parent_id: comment.parent_id,
      created_at: comment.created_at,
      updated_at: comment.updated_at
    };

    return successResponse(
      res,
      { comment: commentData },
      'Comment created successfully',
      201
    );

  } catch (error) {
    console.error('Create comment error:', error);
    return errorResponse(res, 'Failed to create comment', 500);
  }
}

async function handleList(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const {
      target_type,
      target_id,
      page,
      limit
    } = req.query;

    // Validate required query parameters
    if (!target_type || !target_id) {
      return errorResponse(res, 'Target type and target ID are required');
    }

    if (!['upload', 'marketplace_item', 'event'].includes(target_type as string)) {
      return errorResponse(res, 'Invalid target type');
    }

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    // Build query for top-level comments (no parent)
    let query: any = {
      target_type,
      target_id,
      parent_id: null,
      is_active: true
    };

    // Execute query for top-level comments
    const comments = await Comment.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('author_id', 'username avatar_url')
      .select('-__v');

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await Comment.find({
          parent_id: comment._id,
          is_active: true
        })
          .sort({ created_at: 1 })
          .limit(10) // Limit replies per comment
          .populate('author_id', 'username avatar_url')
          .select('-__v');

        return {
          ...comment.toObject(),
          replies: replies.map(reply => ({
            id: reply._id,
            author_id: reply.author_id._id,
            author: reply.author_id ? {
              id: reply.author_id._id,
              username: reply.author_id.username,
              avatar_url: reply.author_id.avatar_url
            } : null,
            target_type: reply.target_type,
            target_id: reply.target_id,
            content: reply.content,
            parent_id: reply.parent_id,
            created_at: reply.created_at,
            updated_at: reply.updated_at
          }))
        };
      })
    );

    // Get total count (only top-level comments)
    const totalItems = await Comment.countDocuments(query);

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalItems);

    // Format response
    const formattedComments = commentsWithReplies.map(comment => ({
      id: comment._id,
      author_id: comment.author_id._id,
      author: comment.author_id ? {
        id: comment.author_id._id,
        username: comment.author_id.username,
        avatar_url: comment.author_id.avatar_url
      } : null,
      target_type: comment.target_type,
      target_id: comment.target_id,
      content: comment.content,
      parent_id: comment.parent_id,
      replies: comment.replies,
      created_at: comment.created_at,
      updated_at: comment.updated_at
    }));

    return successResponse(res, {
      comments: formattedComments,
      pagination
    });

  } catch (error) {
    console.error('List comments error:', error);
    return errorResponse(res, 'Failed to fetch comments', 500);
  }
}

export default handler;