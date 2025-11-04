import mongoose, { Document, Schema } from 'mongoose';

export interface IFollow extends Document {
  _id: mongoose.Types.ObjectId;
  follower_id: mongoose.Types.ObjectId;
  following_id: mongoose.Types.ObjectId;
  created_at: Date;
}

const FollowSchema = new Schema<IFollow>({
  follower_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Follower ID is required']
  },
  following_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Following ID is required']
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Create indexes for better performance
FollowSchema.index(
  { follower_id: 1, following_id: 1 },
  { unique: true } // Prevent duplicate follows
);
FollowSchema.index({ follower_id: 1, created_at: -1 }); // User's following list
FollowSchema.index({ following_id: 1, created_at: -1 }); // User's followers list
FollowSchema.index({ created_at: -1 }); // For recent follows

// Pre-save validation to prevent self-following
FollowSchema.pre<IFollow>('save', function(next) {
  if (this.follower_id.toString() === this.following_id.toString()) {
    const error = new Error('Users cannot follow themselves');
    return next(error);
  }
  next();
});

// Static methods for common queries
FollowSchema.statics.userFollowsUser = function(
  followerId: string,
  followingId: string
) {
  return this.findOne({
    follower_id: followerId,
    following_id: followingId
  });
};

FollowSchema.statics.followUser = function(followerId: string, followingId: string) {
  return this.create({
    follower_id: followerId,
    following_id: followingId
  });
};

FollowSchema.statics.unfollowUser = function(followerId: string, followingId: string) {
  return this.deleteOne({
    follower_id: followerId,
    following_id: followingId
  });
};

FollowSchema.statics.getFollowingCount = function(userId: string) {
  return this.countDocuments({
    follower_id: userId
  });
};

FollowSchema.statics.getFollowersCount = function(userId: string) {
  return this.countDocuments({
    following_id: userId
  });
};

FollowSchema.statics.getFollowingList = function(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  return this.find({
    follower_id: userId
  })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('following_id', 'username avatar_url college bio');
};

FollowSchema.statics.getFollowersList = function(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  return this.find({
    following_id: userId
  })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('follower_id', 'username avatar_url college bio');
};

FollowSchema.statics.getMutualFollowers = function(userId1: string, userId2: string) {
  return this.aggregate([
    {
      $match: {
        $or: [
          { follower_id: userId1, following_id: userId2 },
          { follower_id: userId2, following_id: userId1 }
        ]
      }
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 }
      }
    }
  ]);
};

FollowSchema.statics.getRecentFollows = function(userId: string, limit: number = 20) {
  return this.find({
    $or: [
      { follower_id: userId },
      { following_id: userId }
    ]
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('follower_id', 'username avatar_url')
    .populate('following_id', 'username avatar_url');
};

FollowSchema.statics.getFollowSuggestions = function(userId: string, limit: number = 10) {
  return this.aggregate([
    // Get users that people you follow also follow
    {
      $match: {
        follower_id: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: 'follows',
        localField: 'following_id',
        foreignField: 'follower_id',
        as: 'followsOfPeopleYouFollow'
      }
    },
    { $unwind: '$followsOfPeopleYouFollow' },
    {
      $match: {
        'followsOfPeopleYouFollow.following_id': { $ne: new mongoose.Types.ObjectId(userId) }
      }
    },
    {
      $group: {
        _id: '$followsOfPeopleYouFollow.following_id',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: '$user._id',
        username: '$user.username',
        avatar_url: '$user.avatar_url',
        college: '$user.college',
        mutualConnections: '$count'
      }
    }
  ]);
};

FollowSchema.statics.isFollowing = function(followerId: string, followingId: string) {
  return this.exists({
    follower_id: followerId,
    following_id: followingId
  });
};

export const Follow = mongoose.models.Follow || mongoose.model<IFollow>('Follow', FollowSchema);
export default Follow;