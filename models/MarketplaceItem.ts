import mongoose, { Document, Schema } from 'mongoose';

export interface IMarketplaceItem extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  image_urls: string[];
  seller_id: mongoose.Types.ObjectId;
  status: 'active' | 'sold' | 'removed';
  location?: string;
  is_negotiable: boolean;
  created_at: Date;
  updated_at: Date;
}

const MarketplaceItemSchema = new Schema<IMarketplaceItem>({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    lowercase: true
  },
  condition: {
    type: String,
    enum: {
      values: ['new', 'like_new', 'good', 'fair', 'poor'],
      message: 'Condition must be one of: new, like_new, good, fair, poor'
    },
    required: [true, 'Condition is required']
  },
  image_urls: [{
    type: String,
    required: false
  }],
  seller_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller ID is required']
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'sold', 'removed'],
      message: 'Status must be either active, sold, or removed'
    },
    default: 'active'
  },
  location: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters']
  },
  is_negotiable: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Create indexes for better performance
MarketplaceItemSchema.index({ seller_id: 1, created_at: -1 });
MarketplaceItemSchema.index({ category: 1, status: 1, created_at: -1 });
MarketplaceItemSchema.index({ price: 1 });
MarketplaceItemSchema.index({ condition: 1 });
MarketplaceItemSchema.index({ status: 1, created_at: -1 });
MarketplaceItemSchema.index({ title: 'text', description: 'text', category: 'text' });

// Static methods for common queries
MarketplaceItemSchema.statics.findBySeller = function(sellerId: string, limit: number = 20) {
  return this.find({ seller_id: sellerId })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.findByCategory = function(category: string, limit: number = 20) {
  return this.find({
    category: { $regex: new RegExp(category, 'i') },
    status: 'active'
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.findByPriceRange = function(
  minPrice: number,
  maxPrice: number,
  limit: number = 20
) {
  return this.find({
    price: { $gte: minPrice, $lte: maxPrice },
    status: 'active'
  })
    .sort({ price: 1, created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.findByCondition = function(condition: string, limit: number = 20) {
  return this.find({
    condition: condition,
    status: 'active'
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.searchMarketplace = function(query: string, limit: number = 20) {
  return this.find({
    $and: [
      { status: 'active' },
      { $text: { $search: query } }
    ]
  })
    .sort({ score: { $meta: 'textScore' }, created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.getNewestListings = function(limit: number = 20) {
  return this.find({ status: 'active' })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.getLowestPrice = function(limit: number = 20) {
  return this.find({ status: 'active' })
    .sort({ price: 1, created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

MarketplaceItemSchema.statics.getHighestPrice = function(limit: number = 20) {
  return this.find({ status: 'active' })
    .sort({ price: -1, created_at: -1 })
    .limit(limit)
    .populate('seller_id', 'username avatar_url location');
};

export const MarketplaceItem = mongoose.models.MarketplaceItem || mongoose.model<IMarketplaceItem>('MarketplaceItem', MarketplaceItemSchema);
export default MarketplaceItem;