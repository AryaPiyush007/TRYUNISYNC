import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { deleteFromCloudinary, getFileInfoFromUrl, uploadToCloudinary } from '@/lib/cloudinary';
import { sanitizeString, successResponse, errorResponse } from '@/lib/utils';
import formidable from 'formidable';
import fs from 'fs';
import MarketplaceItem from '@/models/MarketplaceItem';

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
    return errorResponse(res, 'Invalid marketplace item ID', 400);
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

    // Find marketplace item
    const item = await MarketplaceItem.findById(id)
      .populate('seller_id', 'username avatar_url location')
      .select('-__v');

    if (!item) {
      return errorResponse(res, 'Marketplace item not found', 404);
    }

    // Only show active items
    if (item.status !== 'active') {
      return errorResponse(res, 'Marketplace item not found', 404);
    }

    // Format response
    const itemData = {
      id: item._id,
      title: item.title,
      description: item.description,
      price: item.price,
      category: item.category,
      condition: item.condition,
      image_urls: item.image_urls,
      seller_id: item.seller_id._id,
      seller: item.seller_id ? {
        id: item.seller_id._id,
        username: item.seller_id.username,
        avatar_url: item.seller_id.avatar_url,
        location: item.seller_id.location
      } : null,
      location: item.location,
      is_negotiable: item.is_negotiable,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at
    };

    return successResponse(res, { marketplace_item: itemData });

  } catch (error) {
    console.error('Get marketplace item error:', error);
    return errorResponse(res, 'Failed to fetch marketplace item', 500);
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
    let newImages: string[] = [];

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle image upload
      const form = formidable({
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760'),
        keepExtensions: true,
        multiples: true
      });

      const [fields, files] = await form.parse(req);

      // Parse form fields
      const title = fields.title?.[0];
      const description = fields.description?.[0];
      const price = fields.price?.[0];
      const category = fields.category?.[0];
      const condition = fields.condition?.[0];
      const location = fields.location?.[0];
      const isNegotiable = fields.is_negotiable?.[0] === 'true';
      const images = files.images || [];

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

      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return errorResponse(res, 'Price must be a valid positive number');
        }
        updateData.price = priceNum;
      }

      if (category !== undefined) {
        if (category && typeof category === 'string' && category.length <= 50) {
          updateData.category = sanitizeString(category.toLowerCase());
        }
      }

      if (condition !== undefined) {
        if (['new', 'like_new', 'good', 'fair', 'poor'].includes(condition)) {
          updateData.condition = condition;
        }
      }

      if (location !== undefined) {
        if (location && typeof location === 'string' && location.length <= 100) {
          updateData.location = sanitizeString(location);
        }
      }

      if (isNegotiable !== undefined) {
        updateData.is_negotiable = isNegotiable;
      }

      // Handle new images
      if (images.length > 0) {
        const maxImages = 5;
        if (images.length > maxImages) {
          return errorResponse(res, `Maximum ${maxImages} images allowed`);
        }

        for (const image of images) {
          if (image.filepath && image.mimetype) {
            if (!image.mimetype.startsWith('image/')) {
              return errorResponse(res, 'Only image files are allowed');
            }

            const fileContent = fs.readFileSync(image.filepath);
            const cloudinaryResult = await uploadToCloudinary(
              fileContent,
              image.originalFilename || 'marketplace-image',
              'marketplace'
            );

            newImages.push(cloudinaryResult.secure_url);
          }
        }
      }

      // Clean up temporary files
      images.forEach(image => {
        if (image.filepath) {
          fs.unlinkSync(image.filepath);
        }
      });
    } else {
      // Handle JSON update
      const {
        title,
        description,
        price,
        category,
        condition,
        location,
        is_negotiable,
        image_urls
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

      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return errorResponse(res, 'Price must be a valid positive number');
        }
        updateData.price = priceNum;
      }

      if (category !== undefined) {
        if (category && typeof category === 'string' && category.length <= 50) {
          updateData.category = sanitizeString(category.toLowerCase());
        }
      }

      if (condition !== undefined) {
        if (['new', 'like_new', 'good', 'fair', 'poor'].includes(condition)) {
          updateData.condition = condition;
        }
      }

      if (location !== undefined) {
        if (location && typeof location === 'string' && location.length <= 100) {
          updateData.location = sanitizeString(location);
        }
      }

      if (is_negotiable !== undefined) {
        updateData.is_negotiable = is_negotiable;
      }

      if (image_urls !== undefined) {
        if (Array.isArray(image_urls)) {
          updateData.image_urls = image_urls;
        }
      }
    }

    // Connect to database
    await connectDB();

    // Find marketplace item
    const item = await MarketplaceItem.findById(id);

    if (!item) {
      return errorResponse(res, 'Marketplace item not found', 404);
    }

    // Check if user is the seller
    if (item.seller_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to edit this marketplace item', 403);
    }

    // Handle image updates
    if (newImages.length > 0) {
      if (updateData.image_urls && Array.isArray(updateData.image_urls)) {
        updateData.image_urls = [...updateData.image_urls, ...newImages];
      } else {
        updateData.image_urls = [...item.image_urls, ...newImages];
      }

      // Ensure we don't exceed max images
      if (updateData.image_urls.length > 5) {
        updateData.image_urls = updateData.image_urls.slice(0, 5);
      }
    }

    // Update item
    Object.assign(item, updateData);
    await item.save();

    // Populate seller info for response
    await item.populate('seller_id', 'username avatar_url location');

    // Format response
    const itemData = {
      id: item._id,
      title: item.title,
      description: item.description,
      price: item.price,
      category: item.category,
      condition: item.condition,
      image_urls: item.image_urls,
      seller_id: item.seller_id._id,
      seller: item.seller_id ? {
        id: item.seller_id._id,
        username: item.seller_id.username,
        avatar_url: item.seller_id.avatar_url,
        location: item.seller_id.location
      } : null,
      location: item.location,
      is_negotiable: item.is_negotiable,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at
    };

    return successResponse(res, { marketplace_item: itemData }, 'Marketplace item updated successfully');

  } catch (error) {
    console.error('Update marketplace item error:', error);
    return errorResponse(res, 'Failed to update marketplace item', 500);
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

    // Find marketplace item
    const item = await MarketplaceItem.findById(id);

    if (!item) {
      return errorResponse(res, 'Marketplace item not found', 404);
    }

    // Check if user is the seller
    if (item.seller_id.toString() !== userId) {
      return errorResponse(res, 'Not authorized to delete this marketplace item', 403);
    }

    // Delete images from Cloudinary
    try {
      for (const imageUrl of item.image_urls) {
        const fileInfo = getFileInfoFromUrl(imageUrl);
        if (fileInfo) {
          await deleteFromCloudinary(fileInfo.public_id, 'image');
        }
      }
    } catch (cloudinaryError) {
      console.error('Failed to delete images from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Soft delete by marking as removed
    item.status = 'removed';
    await item.save();

    return successResponse(res, null, 'Marketplace item deleted successfully');

  } catch (error) {
    console.error('Delete marketplace item error:', error);
    return errorResponse(res, 'Failed to delete marketplace item', 500);
  }
}

export default handler;