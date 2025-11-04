import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { deleteFromCloudinary, getFileInfoFromUrl, uploadToCloudinary } from '@/lib/cloudinary';
import { sanitizeString, successResponse, errorResponse } from '@/lib/utils';
import formidable from 'formidable';
import fs from 'fs';
import Event from '@/models/Event';

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { method } = req;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return errorResponse(res, 'Invalid event ID', 400);
  }

  switch (method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PUT':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handlePut(req, res, id))(req, res);
    case 'DELETE':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleDelete(req, res, id))(req, res);
    case 'POST':
      return requireAuth((req: AuthenticatedRequest, res: NextApiResponse) => handleAttend(req, res, id))(req, res);
    default:
      return errorResponse(res, 'Method not allowed', 405);
  }
};

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    // Connect to database
    await connectDB();

    // Find event
    const event = await Event.findById(id)
      .populate('organizer_id', 'username avatar_url')
      .select('-__v');

    if (!event || !event.is_active) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Only show published events to public
    if (event.status !== 'published') {
      return errorResponse(res, 'Event not found', 404);
    }

    // Format response
    const eventData = {
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
      created_at: event.created_at,
      updated_at: event.updated_at
    };

    return successResponse(res, { event: eventData });

  } catch (error) {
    console.error('Get event error:', error);
    return errorResponse(res, 'Failed to fetch event', 500);
  }
}

async function handlePut(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Check if this is a form data upload or JSON update
    const contentType = req.headers['content-type'];
    let updateData: any = {};

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle image upload
      const form = formidable({
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760'),
        keepExtensions: true,
        multiples: false
      });

      const [fields, files] = await form.parse(req);

      // Parse form fields
      const title = fields.title?.[0];
      const description = fields.description?.[0];
      const location = fields.location?.[0];
      const startsAt = fields.starts_at?.[0];
      const endsAt = fields.ends_at?.[0];
      const category = fields.category?.[0];
      const maxAttendees = fields.max_attendees?.[0];
      const image = files.image?.[0];

      // Validate and update fields
      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim().length === 0) {
          return errorResponse(res, 'Title is required');
        }
        if (title.length > 200) {
          return errorResponse(res, 'Title must be less than 200 characters');
        }
        updateData.title = sanitizeString(title);
      }

      if (description !== undefined) {
        if (typeof description !== 'string') {
          return errorResponse(res, 'Description must be a string');
        }
        if (description.length > 2000) {
          return errorResponse(res, 'Description must be less than 2000 characters');
        }
        updateData.description = sanitizeString(description);
      }

      if (location !== undefined) {
        if (typeof location !== 'string' || location.trim().length === 0) {
          return errorResponse(res, 'Location is required');
        }
        if (location.length > 200) {
          return errorResponse(res, 'Location must be less than 200 characters');
        }
        updateData.location = sanitizeString(location);
      }

      // Handle date updates
      if (startsAt !== undefined || endsAt !== undefined) {
        const currentEvent = await Event.findById(id);
        if (!currentEvent) {
          return errorResponse(res, 'Event not found', 404);
        }

        const newStartDate = startsAt ? new Date(startsAt) : currentEvent.starts_at;
        const newEndDate = endsAt ? new Date(endsAt) : currentEvent.ends_at;

        if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
          return errorResponse(res, 'Invalid date format');
        }

        if (newEndDate <= newStartDate) {
          return errorResponse(res, 'End time must be after start time');
        }

        updateData.starts_at = newStartDate;
        updateData.ends_at = newEndDate;
      }

      if (category !== undefined) {
        if (category && typeof category === 'string' && category.length <= 50) {
          updateData.category = sanitizeString(category.toLowerCase());
        }
      }

      if (maxAttendees !== undefined) {
        if (maxAttendees === '') {
          updateData.max_attendees = undefined;
        } else {
          const maxAttendeesNum = parseInt(maxAttendees);
          if (!isNaN(maxAttendeesNum) && maxAttendeesNum >= 1) {
            updateData.max_attendees = maxAttendeesNum;
          }
        }
      }

      // Handle new image
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

        updateData.image_url = cloudinaryResult.secure_url;
      }

      // Clean up temporary file
      if (image?.filepath) {
        fs.unlinkSync(image.filepath);
      }
    } else {
      // Handle JSON update
      const {
        title,
        description,
        location,
        starts_at,
        ends_at,
        category,
        max_attendees
      } = req.body;

      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim().length === 0) {
          return errorResponse(res, 'Title is required');
        }
        if (title.length > 200) {
          return errorResponse(res, 'Title must be less than 200 characters');
        }
        updateData.title = sanitizeString(title);
      }

      if (description !== undefined) {
        if (typeof description !== 'string') {
          return errorResponse(res, 'Description must be a string');
        }
        if (description.length > 2000) {
          return errorResponse(res, 'Description must be less than 2000 characters');
        }
        updateData.description = sanitizeString(description);
      }

      if (location !== undefined) {
        if (typeof location !== 'string' || location.trim().length === 0) {
          return errorResponse(res, 'Location is required');
        }
        if (location.length > 200) {
          return errorResponse(res, 'Location must be less than 200 characters');
        }
        updateData.location = sanitizeString(location);
      }

      if (starts_at !== undefined || ends_at !== undefined) {
        const currentEvent = await Event.findById(id);
        if (!currentEvent) {
          return errorResponse(res, 'Event not found', 404);
        }

        const newStartDate = starts_at ? new Date(starts_at) : currentEvent.starts_at;
        const newEndDate = ends_at ? new Date(ends_at) : currentEvent.ends_at;

        if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) {
          return errorResponse(res, 'Invalid date format');
        }

        if (newEndDate <= newStartDate) {
          return errorResponse(res, 'End time must be after start time');
        }

        updateData.starts_at = newStartDate;
        updateData.ends_at = newEndDate;
      }

      if (category !== undefined) {
        if (category && typeof category === 'string' && category.length <= 50) {
          updateData.category = sanitizeString(category.toLowerCase());
        }
      }

      if (max_attendees !== undefined) {
        if (max_attendees === null || max_attendees === '') {
          updateData.max_attendees = undefined;
        } else {
          const maxAttendeesNum = parseInt(max_attendees);
          if (!isNaN(maxAttendeesNum) && maxAttendeesNum >= 1) {
            updateData.max_attendees = maxAttendeesNum;
          }
        }
      }
    }

    // Connect to database
    await connectDB();

    // Find event
    const event = await Event.findById(id);

    if (!event || !event.is_active) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if user is the organizer
    if (event.organizer_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to edit this event', 403);
    }

    // Update event
    Object.assign(event, updateData);
    await event.save();

    // Populate organizer info for response
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
      created_at: event.created_at,
      updated_at: event.updated_at
    };

    return successResponse(res, { event: eventData }, 'Event updated successfully');

  } catch (error) {
    console.error('Update event error:', error);
    return errorResponse(res, 'Failed to update event', 500);
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

    // Find event
    const event = await Event.findById(id);

    if (!event) {
      return errorResponse(res, 'Event not found', 404);
    }

    // Check if user is the organizer
    if (event.organizer_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to delete this event', 403);
    }

    // Delete image from Cloudinary
    if (event.image_url) {
      try {
        const fileInfo = getFileInfoFromUrl(event.image_url);
        if (fileInfo) {
          await deleteFromCloudinary(fileInfo.public_id, 'image');
        }
      } catch (cloudinaryError) {
        console.error('Failed to delete image from Cloudinary:', cloudinaryError);
        // Continue with database deletion even if Cloudinary deletion fails
      }
    }

    // Soft delete by marking as inactive
    event.is_active = false;
    await event.save();

    return successResponse(res, null, 'Event deleted successfully');

  } catch (error) {
    console.error('Delete event error:', error);
    return errorResponse(res, 'Failed to delete event', 500);
  }
}

async function handleAttend(req: AuthenticatedRequest, res: NextApiResponse, id: string) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    // Connect to database
    await connectDB();

    // Find event
    const event = await Event.findById(id);

    if (!event || !event.is_active) {
      return errorResponse(res, 'Event not found', 404);
    }

    if (event.status !== 'published') {
      return errorResponse(res, 'Event is not available for attendance', 400);
    }

    const now = new Date();
    if (event.starts_at <= now) {
      return errorResponse(res, 'Cannot attend past events', 400);
    }

    // Check if event is full
    if (event.max_attendees && event.current_attendees >= event.max_attendees) {
      return errorResponse(res, 'Event is full', 400);
    }

    // Increment attendee count
    await event.addAttendee();

    // Get updated event for response
    const updatedEvent = await Event.findById(id).select('current_attendees max_attendees');

    return successResponse(res, {
      current_attendees: updatedEvent?.current_attendees || 0,
      max_attendees: updatedEvent?.max_attendees,
      message: 'Successfully registered for event'
    }, 'Successfully registered for event');

  } catch (error: any) {
    console.error('Attend event error:', error);
    if (error.message === 'Event is full') {
      return errorResponse(res, 'Event is full', 400);
    }
    return errorResponse(res, 'Failed to register for event', 500);
  }
}

export default handler;