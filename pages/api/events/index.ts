import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { generalLimiter } from '@/lib/rateLimiter';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { sanitizeString, getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import formidable from 'formidable';
import fs from 'fs';
import Event from '@/models/Event';
import User from '@/models/User';

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;

  // Apply rate limiting
  await new Promise((resolve) => generalLimiter(req, res, resolve));

  switch (method) {
    case 'POST':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleCreate(req, res))(req, res);
    case 'GET':
      return handleList(req, res);
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

    // Parse form data
    const form = formidable({
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760'), // 10MB default
      keepExtensions: true,
      multiples: false
    });

    const [fields, files] = await form.parse(req);

    // Extract and validate fields
    const title = fields.title?.[0];
    const description = fields.description?.[0];
    const location = fields.location?.[0];
    const startsAt = fields.starts_at?.[0];
    const endsAt = fields.ends_at?.[0];
    const category = fields.category?.[0];
    const maxAttendees = fields.max_attendees?.[0];
    const image = files.image?.[0];

    // Validate required fields
    if (!title || !description || !location || !startsAt || !endsAt) {
      return errorResponse(res, 'Title, description, location, start time, and end time are required');
    }

    if (typeof title !== 'string' || title.length > 200) {
      return errorResponse(res, 'Title must be less than 200 characters');
    }

    if (typeof description !== 'string' || description.length > 2000) {
      return errorResponse(res, 'Description must be less than 2000 characters');
    }

    if (typeof location !== 'string' || location.length > 200) {
      return errorResponse(res, 'Location must be less than 200 characters');
    }

    // Validate dates
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return errorResponse(res, 'Invalid date format');
    }

    if (startDate <= new Date()) {
      return errorResponse(res, 'Start time must be in the future');
    }

    if (endDate <= startDate) {
      return errorResponse(res, 'End time must be after start time');
    }

    // Validate optional fields
    let maxAttendeesNum: number | undefined;
    if (maxAttendees) {
      maxAttendeesNum = parseInt(maxAttendees);
      if (isNaN(maxAttendeesNum) || maxAttendeesNum < 1) {
        return errorResponse(res, 'Maximum attendees must be a positive number');
      }
    }

    // Handle image upload
    let imageUrl: string | undefined;
    if (image && image.filepath && image.mimetype) {
      if (!image.mimetype.startsWith('image/')) {
        return errorResponse(res, 'Only image files are allowed');
      }

      const fileContent = fs.readFileSync(image.filepath);
      const cloudinaryResult = await uploadToCloudinary(
        fileContent,
        image.originalFilename || 'event-image',
        'events'
      );

      imageUrl = cloudinaryResult.secure_url;
    }

    // Connect to database
    await connectDB();

    // Verify user exists and is active
    const user = await User.findById(userId);
    if (!user || !user.is_active) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    // Create event
    const event = new Event({
      title: sanitizeString(title),
      description: sanitizeString(description),
      location: sanitizeString(location),
      starts_at: startDate,
      ends_at: endDate,
      organizer_id: userId,
      category: category ? sanitizeString(category.toLowerCase()) : 'general',
      max_attendees: maxAttendeesNum,
      image_url: imageUrl
    });

    await event.save();

    // Populate organizer info
    await event.populate('organizer_id', 'username avatar_url');

    // Format response
    const eventData = {
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      organizer_id: event.organizer_id._id,
      organizer: {
        id: event.organizer_id._id,
        username: event.organizer_id.username,
        avatar_url: event.organizer_id.avatar_url
      },
      category: event.category,
      max_attendees: event.max_attendees,
      current_attendees: event.current_attendees,
      image_url: event.image_url,
      status: event.status,
      is_active: event.is_active,
      created_at: event.created_at
    };

    // Clean up temporary file
    if (image?.filepath) {
      fs.unlinkSync(image.filepath);
    }

    return successResponse(
      res,
      { event: eventData },
      'Event created successfully',
      201
    );

  } catch (error: any) {
    console.error('Create event error:', error);

    // Handle file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File too large. Maximum size is 10MB', 413);
    }

    return errorResponse(res, 'Failed to create event', 500);
  }
}

async function handleList(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const {
      page,
      limit,
      category,
      start_date,
      end_date,
      status = 'upcoming'
    } = req.query;

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    // Build query
    let query: any = {
      is_active: true
    };

    // Filter by status
    const now = new Date();
    switch (status) {
      case 'published':
        query.status = 'published';
        break;
      case 'completed':
        query.status = 'published';
        query.ends_at = { $lt: now };
        break;
      case 'upcoming':
        query.status = 'published';
        query.starts_at = { $gte: now };
        break;
      default:
        query.status = 'published';
        break;
    }

    // Apply filters
    if (category && typeof category === 'string') {
      query.category = { $regex: new RegExp(category, 'i') };
    }

    if (start_date && typeof start_date === 'string') {
      const startDate = new Date(start_date);
      if (!isNaN(startDate.getTime())) {
        query.starts_at = { ...query.starts_at, $gte: startDate };
      }
    }

    if (end_date && typeof end_date === 'string') {
      const endDate = new Date(end_date);
      if (!isNaN(endDate.getTime())) {
        query.ends_at = { ...query.ends_at, $lte: endDate };
      }
    }

    // Execute query
    const events = await Event.find(query)
      .sort({ starts_at: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('organizer_id', 'username avatar_url')
      .select('-__v');

    // Get total count
    const totalItems = await Event.countDocuments(query);

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalItems);

    // Format response
    const formattedEvents = events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      organizer_id: event.organizer_id._id,
      organizer: event.organizer_id ? {
        id: event.organizer_id._id,
        username: event.organizer_id.username,
        avatar_url: event.organizer_id.avatar_url
      } : null,
      category: event.category,
      max_attendees: event.max_attendees,
      current_attendees: event.current_attendees,
      image_url: event.image_url,
      status: event.status,
      is_active: event.is_active,
      created_at: event.created_at
    }));

    return successResponse(res, {
      events: formattedEvents,
      pagination
    });

  } catch (error) {
    console.error('List events error:', error);
    return errorResponse(res, 'Failed to fetch events', 500);
  }
}

export default handler;