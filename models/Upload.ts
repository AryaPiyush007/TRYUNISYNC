import mongoose, { Document, Schema } from 'mongoose';

export interface IUpload extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size: number;
  course: string;
  tags: string[];
  uploader_id: mongoose.Types.ObjectId;
  visibility: 'public' | 'private' | 'course_only';
  download_count: number;
  rating: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const UploadSchema = new Schema<IUpload>({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: ''
  },
  file_url: {
    type: String,
    required: [true, 'File URL is required']
  },
  file_type: {
    type: String,
    required: [true, 'File type is required']
  },
  file_size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [1, 'File size must be greater than 0']
  },
  course: {
    type: String,
    required: [true, 'Course is required'],
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  uploader_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader ID is required']
  },
  visibility: {
    type: String,
    enum: {
      values: ['public', 'private', 'course_only'],
      message: 'Visibility must be either public, private, or course_only'
    },
    default: 'public'
  },
  download_count: {
    type: Number,
    default: 0,
    min: [0, 'Download count cannot be negative']
  },
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot exceed 5']
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Create indexes for better performance
UploadSchema.index({ uploader_id: 1, created_at: -1 });
UploadSchema.index({ course: 1, created_at: -1 });
UploadSchema.index({ tags: 1 });
UploadSchema.index({ visibility: 1, is_active: 1 });
UploadSchema.index({ created_at: -1 });
UploadSchema.index({ title: 'text', description: 'text', course: 'text' });

// Static methods for common queries
UploadSchema.statics.findByUploader = function(uploaderId: string, limit: number = 20) {
  return this.find({ uploader_id: uploaderId, is_active: true })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

UploadSchema.statics.findByCourse = function(course: string, limit: number = 20) {
  return this.find({
    course: { $regex: new RegExp(course, 'i') },
    is_active: true,
    visibility: { $in: ['public', 'course_only'] }
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

UploadSchema.statics.findByTags = function(tags: string[], limit: number = 20) {
  return this.find({
    tags: { $in: tags.map(tag => new RegExp(tag, 'i')) },
    is_active: true,
    visibility: { $in: ['public', 'course_only'] }
  })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

UploadSchema.statics.searchUploads = function(query: string, limit: number = 20) {
  return this.find({
    $and: [
      { is_active: true },
      { visibility: { $in: ['public', 'course_only'] } },
      { $text: { $search: query } }
    ]
  })
    .sort({ score: { $meta: 'textScore' }, created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

UploadSchema.statics.getMostDownloaded = function(limit: number = 20) {
  return this.find({
    is_active: true,
    visibility: { $in: ['public', 'course_only'] }
  })
    .sort({ download_count: -1, created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

UploadSchema.statics.getHighestRated = function(limit: number = 20) {
  return this.find({
    is_active: true,
    visibility: { $in: ['public', 'course_only'] },
    rating: { $gt: 0 }
  })
    .sort({ rating: -1, created_at: -1 })
    .limit(limit)
    .populate('uploader_id', 'username avatar_url');
};

// Method to increment download count
UploadSchema.methods.incrementDownloadCount = function() {
  return this.updateOne({ $inc: { download_count: 1 } });
};

export const Upload = mongoose.models.Upload || mongoose.model<IUpload>('Upload', UploadSchema);
export default Upload;