import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { optionalAuth, AuthenticatedRequest } from '@/lib/auth';
import { generalLimiter } from '@/lib/rateLimiter';
import { getPaginationParams, createPagination, successResponse, errorResponse } from '@/lib/utils';
import Upload from '@/models/Upload';
import MarketplaceItem from '@/models/MarketplaceItem';
import Event from '@/models/Event';
import Like from '@/models/Like';
import Follow from '@/models/Follow';

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  // Apply rate limiting
  await new Promise((resolve) => generalLimiter(req, res, resolve));

  if (req.method !== 'GET') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  try {
    const {
      page,
      limit,
      type = 'all',
      timeframe = 'all'
    } = req.query;

    // Get pagination parameters
    const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

    // Connect to database
    await connectDB();

    // Build date filter
    let dateFilter: any = {};
    const now = new Date();

    switch (timeframe) {
      case 'today':
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter.created_at = { $gte: today };
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter.created_at = { $gte: weekAgo };
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter.created_at = { $gte: monthAgo };
        break;
      default:
        // No date filter for 'all'
        break;
    }

    // Get feed items
    const feedItems = await getFeedItems(req.user?.id, type as string, dateFilter, skip, limitNum);

    // Get total count
    const totalCount = await getFeedItemsCount(req.user?.id, type as string, dateFilter);

    // Create pagination metadata
    const pagination = createPagination(pageNum, limitNum, totalCount);

    return successResponse(res, {
      items: feedItems,
      pagination
    });

  } catch (error) {
    console.error('Feed error:', error);
    return errorResponse(res, 'Failed to fetch feed', 500);
  }
};

async function getFeedItems(
  userId: string | undefined,
  type: string,
  dateFilter: any,
  skip: number,
  limit: number
) {
  const items: any[] = [];
  const now = new Date();

  // Get uploads
  if (type === 'all' || type === 'uploads') {
    const uploadQuery: any = {
      is_active: true,
      ...dateFilter
    };

    // If not authenticated, only show public uploads
    if (!userId) {
      uploadQuery.visibility = 'public';
    }

    const uploads = await Upload.find(uploadQuery)
      .sort({ created_at: -1 })
      .limit(Math.ceil(limit / 3)) // Distribute limit among types
      .populate('uploader_id', 'username avatar_url')
      .select('-__v');

    for (const upload of uploads) {
      items.push({
        id: upload._id,
        type: 'upload',
        title: upload.title,
        description: upload.description,
        author: upload.uploader_id ? {
          id: upload.uploader_id._id,
          username: upload.uploader_id.username,
          avatar_url: upload.uploader_id.avatar_url
        } : null,
        created_at: upload.created_at,
        metadata: {
          file_url: upload.file_url,
          file_type: upload.file_type,
          file_size: upload.file_size,
          course: upload.course,
          tags: upload.tags,
          download_count: upload.download_count,
          rating: upload.rating,
          visibility: upload.visibility
        }
      });
    }
  }

  // Get marketplace items
  if (type === 'all' || type === 'marketplace') {
    const marketplaceQuery: any = {
      status: 'active',
      ...dateFilter
    };

    const marketplaceItems = await MarketplaceItem.find(marketplaceQuery)
      .sort({ created_at: -1 })
      .limit(Math.ceil(limit / 3))
      .populate('seller_id', 'username avatar_url')
      .select('-__v');

    for (const item of marketplaceItems) {
      items.push({
        id: item._id,
        type: 'marketplace_item',
        title: item.title,
        description: item.description,
        author: item.seller_id ? {
          id: item.seller_id._id,
          username: item.seller_id.username,
          avatar_url: item.seller_id.avatar_url
        } : null,
        created_at: item.created_at,
        metadata: {
          price: item.price,
          category: item.category,
          condition: item.condition,
          image_urls: item.image_urls,
          location: item.location,
          is_negotiable: item.is_negotiable
        }
      });
    }
  }

  // Get events
  if (type === 'all' || type === 'events') {
    const eventQuery: any = {
      status: 'published',
      is_active: true,
      ...dateFilter
    };

    // For events, also filter by upcoming vs past
    if (timeframe === 'all') {
      // Show both upcoming and recent past events
      const recentPast = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      eventQuery.$or = [
        { starts_at: { $gte: now } }, // Upcoming events
        { starts_at: { $gte: recentPast, $lt: now } } // Recent past events
      ];
    } else {
      eventQuery.starts_at = { $gte: now }; // Only upcoming events for filtered timeframes
    }

    const events = await Event.find(eventQuery)
      .sort({ starts_at: type === 'events' ? 1 : -1 }) // Sort by date for events-only, by creation for mixed feed
      .limit(Math.ceil(limit / 3))
      .populate('organizer_id', 'username avatar_url')
      .select('-__v');

    for (const event of events) {
      items.push({
        id: event._id,
        type: 'event',
        title: event.title,
        description: event.description,
        author: event.organizer_id ? {
          id: event.organizer_id._id,
          username: event.organizer_id.username,
          avatar_url: event.organizer_id.avatar_url
        } : null,
        created_at: event.created_at,
        metadata: {
          location: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          category: event.category,
          max_attendees: event.max_attendees,
          current_attendees: event.current_attendees,
          image_url: event.image_url
        }
      });
    }
  }

  // Sort all items by creation date (newest first)
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Apply pagination
  return items.slice(skip, skip + limit);
}

async function getFeedItemsCount(
  userId: string | undefined,
  type: string,
  dateFilter: any
): Promise<number> {
  let totalCount = 0;

  // Count uploads
  if (type === 'all' || type === 'uploads') {
    const uploadQuery: any = {
      is_active: true,
      ...dateFilter
    };

    if (!userId) {
      uploadQuery.visibility = 'public';
    }

    const uploadCount = await Upload.countDocuments(uploadQuery);
    totalCount += uploadCount;
  }

  // Count marketplace items
  if (type === 'all' || type === 'marketplace') {
    const marketplaceQuery: any = {
      status: 'active',
      ...dateFilter
    };

    const marketplaceCount = await MarketplaceItem.countDocuments(marketplaceQuery);
    totalCount += marketplaceCount;
  }

  // Count events
  if (type === 'all' || type === 'events') {
    const now = new Date();
    const eventQuery: any = {
      status: 'published',
      is_active: true,
      ...dateFilter
    };

    if (type === 'events') {
      eventQuery.starts_at = { $gte: now };
    } else {
      const recentPast = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      eventQuery.$or = [
        { starts_at: { $gte: now } },
        { starts_at: { $gte: recentPast, $lt: now } }
      ];
    }

    const eventCount = await Event.countDocuments(eventQuery);
    totalCount += eventCount;
  }

  return totalCount;
}

export default optionalAuth(handler);