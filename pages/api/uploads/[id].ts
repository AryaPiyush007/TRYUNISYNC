import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest, optionalAuth } from '@/lib/auth';
import { deleteFromCloudinary, getFileInfoFromUrl } from '@/lib/cloudinary';
import { sanitizeString, successResponse, errorResponse } from '@/lib/utils';
import Upload from '@/models/Upload';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return errorResponse(res, 'Invalid upload ID', 400);
  }

  switch (method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PUT':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handlePut(req, res, id))(req, res);
    case 'DELETE':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleDelete(req, res, id))(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    // Connect to database
    await connectDB();

    // Find upload
    const upload = await Upload.findById(id)
      .populate('uploader_id', 'username avatar_url')
      .select('-__v');

    if (!upload || !upload.is_active) {
      return errorResponse(res, 'Upload not found', 404);
    }

    // Check visibility permissions
    if (!req.user?.id) {
      // Unauthenticated users can only see public uploads
      if (upload.visibility !== 'public') {
        return errorResponse(res, 'Upload not found', 404);
      }
    } else {
      // Authenticated users can see public uploads and their own private uploads
      if (upload.visibility !== 'public' && upload.uploader_id._id.toString() !== req.user.id) {
        return errorResponse(res, 'Upload not found', 404);
      }
    }

    // Increment download count (only for authenticated users or when actually downloading)
    if (req.user?.id && upload.uploader_id._id.toString() !== req.user.id) {
      await upload.incrementDownloadCount();
      upload.download_count += 1; // Update for response
    }

    // Format response
    const uploadData = {
      id: upload._id,
      title: upload.title,
      description: upload.description,
      file_url: upload.file_url,
      file_type: upload.file_type,
      file_size: upload.file_size,
      course: upload.course,
      tags: upload.tags,
      uploader_id: upload.uploader_id._id,
      uploader: upload.uploader_id ? {
        id: upload.uploader_id._id,
        username: upload.uploader_id.username,
        avatar_url: upload.uploader_id.avatar_url
      } : null,
      visibility: upload.visibility,
      download_count: upload.download_count,
      rating: upload.rating,
      created_at: upload.created_at,
      updated_at: upload.updated_at
    };

    return successResponse(res, { upload: uploadData });

  } catch (error) {
    console.error('Get upload error:', error);
    return errorResponse(res, 'Failed to fetch upload', 500);
  }
}

async function handlePut(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const {
      title,
      description,
      course,
      tags,
      visibility
    } = req.body;

    // Connect to database
    await connectDB();

    // Find upload
    const upload = await Upload.findById(id);

    if (!upload || !upload.is_active) {
      return errorResponse(res, 'Upload not found', 404);
    }

    // Check if user is the uploader
    if (upload.uploader_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to edit this upload', 403);
    }

    // Validate and update fields
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return errorResponse(res, 'Title is required');
      }
      if (title.length > 200) {
        return errorResponse(res, 'Title must be less than 200 characters');
      }
      upload.title = sanitizeString(title);
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        return errorResponse(res, 'Description must be a string');
      }
      if (description.length > 1000) {
        return errorResponse(res, 'Description must be less than 1000 characters');
      }
      upload.description = sanitizeString(description);
    }

    if (course !== undefined) {
      if (typeof course !== 'string' || course.trim().length === 0) {
        return errorResponse(res, 'Course is required');
      }
      if (course.length > 100) {
        return errorResponse(res, 'Course must be less than 100 characters');
      }
      upload.course = sanitizeString(course);
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return errorResponse(res, 'Tags must be an array');
      }
      if (tags.length > 10) {
        return errorResponse(res, 'Maximum 10 tags allowed');
      }
      upload.tags = tags.filter(tag => tag && typeof tag === 'string')
        .map(tag => sanitizeString(tag.trim()))
        .filter(tag => tag.length > 0);
    }

    if (visibility !== undefined) {
      if (!['public', 'private', 'course_only'].includes(visibility)) {
        return errorResponse(res, 'Invalid visibility setting');
      }
      upload.visibility = visibility;
    }

    await upload.save();

    // Populate uploader info for response
    await upload.populate('uploader_id', 'username avatar_url');

    // Format response
    const uploadData = {
      id: upload._id,
      title: upload.title,
      description: upload.description,
      file_url: upload.file_url,
      file_type: upload.file_type,
      file_size: upload.file_size,
      course: upload.course,
      tags: upload.tags,
      uploader_id: upload.uploader_id._id,
      uploader: upload.uploader_id ? {
        id: upload.uploader_id._id,
        username: upload.uploader_id.username,
        avatar_url: upload.uploader_id.avatar_url
      } : null,
      visibility: upload.visibility,
      download_count: upload.download_count,
      rating: upload.rating,
      created_at: upload.created_at,
      updated_at: upload.updated_at
    };

    return successResponse(res, { upload: uploadData }, 'Upload updated successfully');

  } catch (error) {
    console.error('Update upload error:', error);
    return errorResponse(res, 'Failed to update upload', 500);
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

    // Find upload
    const upload = await Upload.findById(id);

    if (!upload) {
      return errorResponse(res, 'Upload not found', 404);
    }

    // Check if user is the uploader
    if (upload.uploader_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to delete this upload', 403);
    }

    // Delete file from Cloudinary
    try {
      const fileInfo = getFileInfoFromUrl(upload.file_url);
      if (fileInfo) {
        await deleteFromCloudinary(fileInfo.public_id, 'auto');
      }
    } catch (cloudinaryError) {
      console.error('Failed to delete from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Soft delete from database (mark as inactive)
    upload.is_active = false;
    await upload.save();

    return successResponse(res, null, 'Upload deleted successfully');

  } catch (error) {
    console.error('Delete upload error:', error);
    return errorResponse(res, 'Failed to delete upload', 500);
  }
}

// Apply optional auth for GET (to show more data for authenticated users)
const wrappedHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    return optionalAuth(handler)(req, res);
  } else {
    return handler(req, res);
  }
};

export default wrappedHandler;