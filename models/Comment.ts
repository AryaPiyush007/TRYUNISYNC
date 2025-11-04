import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
  _id: mongoose.Types.ObjectId;
  author_id: mongoose.Types.ObjectId;
  target_type: 'upload' | 'marketplace_item' | 'event';
  target_id: mongoose.Types.ObjectId;
  content: string;
  parent_id?: mongoose.Types.ObjectId;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const CommentSchema = new Schema<IComment>({
  author_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author ID is required']
  },
  target_type: {
    type: String,
    enum: {
      values: ['upload', 'marketplace_item', 'event'],
      message: 'Target type must be either upload, marketplace_item, or event'
    },
    required: [true, 'Target type is required']
  },
  target_id: {
    type: Schema.Types.ObjectId,
    required: [true, 'Target ID is required']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    minlength: [1, 'Content cannot be empty'],
    maxlength: [1000, 'Content cannot exceed 1000 characters']
  },
  parent_id: {
    type: Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Create indexes for better performance
CommentSchema.index({ author_id: 1, created_at: -1 });
CommentSchema.index({ target_type: 1, target_id: 1, created_at: 1 });
CommentSchema.index({ parent_id: 1, created_at: 1 });
CommentSchema.index({ is_active: 1, created_at: -1 });

// Compound index for getting comments on a specific target
CommentSchema.index({ target_type: 1, target_id: 1, parent_id: 1, is_active: 1, created_at: 1 });

// Static methods for common queries
CommentSchema.statics.findByTarget = function(
  targetType: string,
  targetId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  return this.find({
    target_type: targetType,
    target_id: targetId,
    parent_id: null, // Only top-level comments
    is_active: true
  })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('author_id', 'username avatar_url')
    .populate({
      path: 'replies',
      match: { is_active: true },
      options: { sort: { created_at: 1 } },
      populate: {
        path: 'author_id',
        select: 'username avatar_url'
      }
    });
};

CommentSchema.statics.findByAuthor = function(authorId: string, limit: number = 20) {
  return this.find({
    author_id: authorId,
    is_active: true
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('target_id', 'title')
    .populate('author_id', 'username avatar_url');
};

CommentSchema.statics.findReplies = function(
  parentId: string,
  limit: number = 20
) {
  return this.find({
    parent_id: parentId,
    is_active: true
  })
    .sort({ created_at: 1 })
    .limit(limit)
    .populate('author_id', 'username avatar_url');
};

CommentSchema.statics.getCommentCount = function(targetType: string, targetId: string) {
  return this.countDocuments({
    target_type: targetType,
    target_id: targetId,
    is_active: true
  });
};

CommentSchema.statics.getRecentComments = function(limit: number = 20) {
  return this.find({ is_active: true })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('author_id', 'username avatar_url')
    .populate('target_id', 'title');
};

// Method to get replies
CommentSchema.methods.getReplies = function(page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;

  return this.constructor
    .find({
      parent_id: this._id,
      is_active: true
    })
    .sort({ created_at: 1 })
    .skip(skip)
    .limit(limit)
    .populate('author_id', 'username avatar_url');
};

// Method to check if user can edit/delete this comment
CommentSchema.methods.canUserEdit = function(userId: string): boolean {
  return this.author_id.toString() === userId;
};

// Virtual for reply count
CommentSchema.virtual('reply_count', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parent_id',
  count: true,
  match: { is_active: true }
});

export const Comment = mongoose.models.Comment || mongoose.model<IComment>('Comment', CommentSchema);
export default Comment;