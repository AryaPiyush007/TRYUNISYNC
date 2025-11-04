import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { requireAuth, AuthenticatedRequest } from '@/lib/auth';
import { marketplaceLimiter, generalLimiter } from '@/lib/rateLimiter';
import { uploadToCloudinary, deleteFromCloudinary, getFileInfoFromUrl, isFileTypeAllowed } from '@/lib/cloudinary';
import { sanitizeString, getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import formidable from 'formidable';
import fs from 'fs';
import MarketplaceItem from '@/models/MarketplaceItem';
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
    await new Promise((resolve) => marketplaceLimiter(req, res, resolve));
  } else {
    await new Promise((resolve) => generalLimiter(req, res, resolve));
  }

  switch (method) {
    case 'POST':
      return handleCreate(req, res);
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
      multiples: true, // Allow multiple files
      maxTotalFileSize: 50 * 1024 * 1024 // 50MB total for multiple images
    });

    const [fields, files] = await form.parse(req);

    // Extract and validate fields
    const title = fields.title?.[0];
    const description = fields.description?.[0];
    const price = fields.price?.[0];
    const category = fields.category?.[0];
    const condition = fields.condition?.[0];
    const location = fields.location?.[0];
    const isNegotiable = fields.is_negotiable?.[0] === 'true';
    const images = files.images || [];

    // Validate required fields
    if (!title || !description || !price) {
      return errorResponse(res, 'Title, description, and price are required');
    }

    if (typeof title !== 'string' || title.length > 200) {
      return errorResponse(res, 'Title must be less than 200 characters');
    }

    if (typeof description !== 'string' || description.length > 2000) {
      return errorResponse(res, 'Description must be less than 2000 characters');
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return errorResponse(res, 'Price must be a valid positive number');
    }

    if (category && (typeof category !== 'string' || category.length > 50)) {
      return errorResponse(res, 'Category must be less than 50 characters');
    }

    if (!condition || !['new', 'like_new', 'good', 'fair', 'poor'].includes(condition)) {
      return errorResponse(res, 'Valid condition is required');
    }

    if (location && (typeof location !== 'string' || location.length > 100)) {
      return errorResponse(res, 'Location must be less than 100 characters');
    }

    // Validate and upload images
    const imageUrls: string[] = [];
    const maxImages = 5;

    if (images.length > maxImages) {
      return errorResponse(res, `Maximum ${maxImages} images allowed`);
    }

    for (const image of images) {
      if (image.filepath && image.mimetype) {
        // Only allow image files
        if (!image.mimetype.startsWith('image/')) {
          return errorResponse(res, 'Only image files are allowed');
        }

        if (!isFileTypeAllowed(image.mimetype)) {
          return errorResponse(res, 'Invalid image type');
        }

        // Read file content and upload to Cloudinary
        const fileContent = fs.readFileSync(image.filepath);
        const cloudinaryResult = await uploadToCloudinary(
          fileContent,
          image.originalFilename || 'marketplace-image',
          'marketplace'
        );

        imageUrls.push(cloudinaryResult.secure_url);
      }
    }

    // Connect to database
    await connectDB();

    // Verify user exists and is active
    const user = await User.findById(userId);
    if (!user || !user.is_active) {
      return errorResponse(res, 'User not found or inactive', 401);
    }

    // Create marketplace item
    const marketplaceItem = new MarketplaceItem({
      title: sanitizeString(title),
      description: sanitizeString(description),
      price: priceNum,
      category: category ? sanitizeString(category.toLowerCase()) : 'general',
      condition,
      image_urls: imageUrls,
      seller_id: userId,
      location: location ? sanitizeString(location) : '',
      is_negotiable: isNegotiable
    });

    await marketplaceItem.save();

    // Populate seller info
    await marketplaceItem.populate('seller_id', 'username avatar_url location');

    // Format response
    const itemData = {
      id: marketplaceItem._id,
      title: marketplaceItem.title,
      description: marketplaceItem.description,
      price: marketplaceItem.price,
      category: marketplaceItem.category,
      condition: marketplaceItem.condition,
      image_urls: marketplaceItem.image_urls,
      seller_id: marketplaceItem.seller_id._id,
      seller: {
        id: marketplaceItem.seller_id._id,
        username: marketplaceItem.seller_id.username,
        avatar_url: marketplaceItem.seller_id.avatar_url,
        location: marketplaceItem.seller_id.location
      },
      location: marketplaceItem.location,
      is_negotiable: marketplaceItem.is_negotiable,
      status: marketplaceItem.status,
      created_at: marketplaceItem.created_at
    };

    // Clean up temporary files
    images.forEach(image => {
      if (image.filepath) {
        fs.unlinkSync(image.filepath);
      }
    });

    return successResponse(
      res,
      { marketplace_item: itemData },
      'Marketplace listing created successfully',
      201
    );

  } catch (error: any) {
    console.error('Create marketplace item error:', error);

    // Handle file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File too large. Maximum size is 10MB per image', 413);
    }

    return errorResponse(res, 'Failed to create marketplace listing', 500);
  }
}

async function handleList(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const {
      page,
      limit,
      category,
      condition,
      min_price,
      max_price,
      search,
      sort = 'newest'
    } = req.query;

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    // Build query
    let query: any = {
      status: 'active'
    };

    // Apply filters
    if (category && typeof category === 'string') {
      query.category = { $regex: new RegExp(category, 'i') };
    }

    if (condition && typeof condition === 'string') {
      if (['new', 'like_new', 'good', 'fair', 'poor'].includes(condition)) {
        query.condition = condition;
      }
    }

    if (min_price) {
      const minPrice = parseFloat(min_price as string);
      if (!isNaN(minPrice) && minPrice >= 0) {
        query.price = { ...query.price, $gte: minPrice };
      }
    }

    if (max_price) {
      const maxPrice = parseFloat(max_price as string);
      if (!isNaN(maxPrice) && maxPrice >= 0) {
        query.price = { ...query.price, $lte: maxPrice };
      }
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
      case 'price_low':
        sortOptions = { price: 1, created_at: -1 };
        break;
      case 'price_high':
        sortOptions = { price: -1, created_at: -1 };
        break;
      case 'newest':
      default:
        sortOptions = { created_at: -1 };
        break;
    }

    // Execute query
    const items = await MarketplaceItem.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate('seller_id', 'username avatar_url location')
      .select('-__v');

    // Get total count
    const totalItems = await MarketplaceItem.countDocuments(query);

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalItems);

    // Format response
    const formattedItems = items.map(item => ({
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
      created_at: item.created_at
    }));

    return successResponse(res, {
      marketplace_items: formattedItems,
      pagination
    });

  } catch (error) {
    console.error('List marketplace items error:', error);
    return errorResponse(res, 'Failed to fetch marketplace items', 500);
  }
}

// Wrap handler with authentication middleware for POST
const wrappedHandler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    return requireAuth(handler)(req, res);
  } else {
    // For GET, no authentication required
    return handler(req, res);
  }
};

export default wrappedHandler;