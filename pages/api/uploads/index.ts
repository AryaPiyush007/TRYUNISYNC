import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { uploadLimiter, generalLimiter } from '@/lib/rateLimiter';
import { uploadToCloudinary, deleteFromCloudinary, getFileInfoFromUrl, isFileTypeAllowed } from '@/lib/cloudinary';
import { sanitizeString, getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import formidable from 'formidable';
import fs from 'fs';
import Upload from '@/models/Upload';
import User from '@/models/User';

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;

  // Apply rate limiting based on method
  if (method === 'POST') {
    await new Promise((resolve) => uploadLimiter(req, res, resolve));
  } else {
    await new Promise((resolve) => generalLimiter(req, res, resolve));
  }

  switch (method) {
    case 'POST':
      return handleUpload(req, res);
    case 'GET':
      return handleList(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleUpload(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Parse form data
    const form = formidable({
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760'), // 10MB default
      keepExtensions: true,
      multiples: false
    });

    const [fields, files] = await form.parse(req);

    // Extract and validate fields
    const title = fields.title?.[0];
    const description = fields.description?.[0] || '';
    const course = fields.course?.[0];
    const tags = fields.tags ? fields.tags[0].split(',').map((tag: string) => tag.trim()) : [];
    const visibility = fields.visibility?.[0] || 'public';

    // Validate required fields
    if (!title) {
      return errorResponse(res, 'Title is required');
    }

    if (!course) {
      return errorResponse(res, 'Course is required');
    }

    if (typeof title !== 'string' || title.length > 200) {
      return errorResponse(res, 'Title must be less than 200 characters');
    }

    if (typeof description !== 'string' || description.length > 1000) {
      return errorResponse(res, 'Description must be less than 1000 characters');
    }

    if (typeof course !== 'string' || course.length > 100) {
      return errorResponse(res, 'Course must be less than 100 characters');
    }

    if (!['public', 'private', 'course_only'].includes(visibility)) {
      return errorResponse(res, 'Invalid visibility setting');
    }

    if (tags.length > 10) {
      return errorResponse(res, 'Maximum 10 tags allowed');
    }

    // Check if file was uploaded
    const file = files.file?.[0];
    if (!file) {
      return errorResponse(res, 'File is required');
    }

    // Validate file type
    if (!isFileTypeAllowed(file.mimetype || '')) {
      return errorResponse(res, 'File type not allowed. Allowed types: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG, TXT');
    }

    // Read file content
    const fileContent = fs.readFileSync(file.filepath);

    // Connect to database
    await connectDB();

    // Verify user exists and is active
    const user = await User.findById(userId);
    if (!user || !user.is_active) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(
      fileContent,
      file.originalFilename || 'file',
      'uploads'
    );

    // Create upload record in database
    const upload = new Upload({
      title: sanitizeString(title),
      description: sanitizeString(description),
      file_url: cloudinaryResult.secure_url,
      file_type: file.mimetype || 'unknown',
      file_size: file.size,
      course: sanitizeString(course),
      tags: tags.filter(tag => tag.length > 0).map(tag => sanitizeString(tag)),
      uploader_id: userId,
      visibility
    });

    await upload.save();

    // Populate uploader info
    await upload.populate('uploader_id', 'username avatar_url');

    // Return upload data
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
      uploader: {
        id: upload.uploader_id._id,
        username: upload.uploader_id.username,
        avatar_url: upload.uploader_id.avatar_url
      },
      visibility: upload.visibility,
      download_count: upload.download_count,
      rating: upload.rating,
      created_at: upload.created_at
    };

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    return successResponse(
      res,
      { upload: uploadData },
      'File uploaded successfully',
      201
    );

  } catch (error: any) {
    console.error('Upload error:', error);

    // Handle file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File too large. Maximum size is 10MB', 413);
    }

    // Handle other formidable errors
    if (error.message.includes('Invalid file')) {
      return errorResponse(res, 'Invalid file', 400);
    }

    return errorResponse(res, 'Upload failed. Please try again.', 500);
  }
}

async function handleList(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const {
      page,
      limit,
      course,
      tags,
      search,
      sort = 'newest'
    } = req.query;

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    // Build query
    let query: any = {
      is_active: true
    };

    // If user is not authenticated, only show public content
    if (!req.user?.id) {
      query.visibility = 'public';
    } else {
      // If authenticated, show public content and user's private content
      query.$or = [
        { visibility: 'public' },
        { uploader_id: req.user.id }
      ];
    }

    // Apply filters
    if (course && typeof course === 'string') {
      query.course = { $regex: new RegExp(course, 'i') };
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray };
    }

    if (search && typeof search === 'string') {
      query.$text = { $search: search };
    }

    // Build sort options
    let sortOptions: any = {};
    switch (sort) {
      case 'oldest':
        sortOptions = { created_at: 1 };
        break;
      case 'most_downloaded':
        sortOptions = { download_count: -1, created_at: -1 };
        break;
      case 'highest_rated':
        sortOptions = { rating: -1, created_at: -1 };
        break;
      case 'newest':
      default:
        sortOptions = { created_at: -1 };
        break;
    }

    // Execute query
    const uploads = await Upload.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate('uploader_id', 'username avatar_url')
      .select('-__v');

    // Get total count
    const totalItems = await Upload.countDocuments(query);

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalItems);

    // Format response
    const formattedUploads = uploads.map(upload => ({
      id: upload._id,
      title: upload.title,
      description: upload.description,
      file_url: upload.file_url,
      file_type: upload.file_type,
      file_size: upload.file_size,
      course: upload.course,
      tags: upload.tags,
      uploader: upload.uploader_id ? {
        id: upload.uploader_id._id,
        username: upload.uploader_id.username,
        avatar_url: upload.uploader_id.avatar_url
      } : null,
      download_count: upload.download_count,
      rating: upload.rating,
      created_at: upload.created_at
    }));

    return successResponse(res, {
      uploads: formattedUploads,
      pagination
    });

  } catch (error) {
    console.error('List uploads error:', error);
    return errorResponse(res, 'Failed to fetch uploads', 500);
  }
}

// Wrap handler with authentication middleware for POST, optional for GET
const wrappedHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    return requireAuth(handler)(req, res);
  } else {
    // For GET, use optional auth
    const { optionalAuth } = require('@/lib/auth');
    return optionalAuth(handler)(req, res);
  }
};

export default wrappedHandler;