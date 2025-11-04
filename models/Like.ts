import mongoose, { Document, Schema } from 'mongoose';

export interface ILike extends Document {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  target_type: 'upload' | 'marketplace_item' | 'event' | 'comment';
  target_id: mongoose.Types.ObjectId;
  created_at: Date;
}

const LikeSchema = new Schema<ILike>({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  target_type: {
    type: String,
    enum: {
      values: ['upload', 'marketplace_item', 'event', 'comment'],
      message: 'Target type must be one of: upload, marketplace_item, event, comment'
    },
    required: [true, 'Target type is required']
  },
  target_id: {
    type: Schema.Types.ObjectId,
    required: [true, 'Target ID is required']
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Create indexes for better performance
LikeSchema.index({ user_id: 1, target_type: 1, target_id: 1 }, { unique: true }); // Prevent duplicate likes
LikeSchema.index({ target_type: 1, target_id: 1 }); // For counting likes on a target
LikeSchema.index({ user_id: 1, created_at: -1 }); // For user's liked content
LikeSchema.index({ created_at: -1 }); // For recent likes

// Static methods for common queries
LikeSchema.statics.userLikesTarget = function(
  userId: string,
  targetType: string,
  targetId: string
) {
  return this.findOne({
    user_id: userId,
    target_type: targetType,
    target_id: targetId
  });
};

LikeSchema.statics.getLikeCount = function(targetType: string, targetId: string) {
  return this.countDocuments({
    target_type: targetType,
    target_id: targetId
  });
};

LikeSchema.statics.getUserLikes = function(userId: string, limit: number = 20) {
  return this.find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('target_id', 'title file_url image_url')
    .populate('user_id', 'username avatar_url');
};

LikeSchema.statics.getLikesByType = function(targetType: string, limit: number = 20) {
  return this.find({ target_type: targetType })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('target_id', 'title')
    .populate('user_id', 'username avatar_url');
};

LikeSchema.statics.toggleLike = function(
  userId: string,
  targetType: string,
  targetId: string
) {
  return this.findOneAndDelete({
    user_id: userId,
    target_type: targetType,
    target_id: targetId
  });
};

LikeSchema.statics.addLike = function(
  userId: string,
  targetType: string,
  targetId: string
) {
  return this.create({
    user_id: userId,
    target_type: targetType,
    target_id: targetId
  });
};

LikeSchema.statics.removeLike = function(
  userId: string,
  targetType: string,
  targetId: string
) {
  return this.deleteOne({
    user_id: userId,
    target_type: targetType,
    target_id: targetId
  });
};

LikeSchema.statics getUsersWhoLiked = function(targetType: string, targetId: string, limit: number = 20) {
  return this.find({
    target_type: targetType,
    target_id: targetId
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('user_id', 'username avatar_url')
    .select('user_id created_at');
};

LikeSchema.statics.getMostLikedContent = function(targetType: string, limit: number = 20) {
  return this.aggregate([
    { $match: { target_type: targetType } },
    {
      $group: {
        _id: '$target_id',
        likeCount: { $sum: 1 },
        latestLike: { $max: '$created_at' }
      }
    },
    { $sort: { likeCount: -1, latestLike: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: `${targetType}s`,
        localField: '_id',
        foreignField: '_id',
        as: 'target'
      }
    },
    { $unwind: '$target' },
    {
      $project: {
        _id: '$target._id',
        likeCount: 1,
        latestLike: 1,
        title: '$target.title',
        description: '$target.description',
        created_at: '$target.created_at'
      }
    }
  ]);
};

export const Like = mongoose.models.Like || mongoose.model<ILike>('Like', LikeSchema);
export default Like;