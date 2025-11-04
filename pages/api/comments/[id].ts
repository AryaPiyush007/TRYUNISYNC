import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { sanitizeString, successResponse, errorResponse } from '@/lib/utils';
import Comment from '@/models/Comment';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return errorResponse(res, 'Invalid comment ID', 400);
  }

  switch (method) {
    case 'PUT':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleUpdate(req, res, id))(req, res);
    case 'DELETE':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleDelete(req, res, id))(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleUpdate(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse(res, 'Content is required');
    }

    if (content.length > 1000) {
      return errorResponse(res, 'Content must be less than 1000 characters');
    }

    // Connect to database
    await connectDB();

    // Find comment
    const comment = await Comment.findById(id);

    if (!comment || !comment.is_active) {
      return errorResponse(res, 'Comment not found', 404);
    }

    // Check if user is the author
    if (comment.author_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to edit this comment', 403);
    }

    // Update comment
    comment.content = sanitizeString(content);
    await comment.save();

    // Populate author info for response
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

    return successResponse(res, { comment: commentData }, 'Comment updated successfully');

  } catch (error) {
    console.error('Update comment error:', error);
    return errorResponse(res, 'Failed to update comment', 500);
  }
}

async function handleDelete(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Connect to database
    await connectDB();

    // Find comment
    const comment = await Comment.findById(id);

    if (!comment) {
      return errorResponse(res, 'Comment not found', 404);
    }

    // Check if user is the author
    if (comment.author_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to delete this comment', 403);
    }

    // Soft delete by marking as inactive
    comment.is_active = false;
    await comment.save();

    return successResponse(res, null, 'Comment deleted successfully');

  } catch (error) {
    console.error('Delete comment error:', error);
    return errorResponse(res, 'Failed to delete comment', 500);
  }
}

export default handler;