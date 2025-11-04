import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  location: string;
  starts_at: Date;
  ends_at: Date;
  organizer_id: mongoose.Types.ObjectId;
  category: string;
  max_attendees?: number;
  current_attendees: number;
  image_url?: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const EventSchema = new Schema<IEvent>({
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
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  starts_at: {
    type: Date,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(value: Date) {
        return value > new Date();
      },
      message: 'Start time must be in the future'
    }
  },
  ends_at: {
    type: Date,
    required: [true, 'End time is required'],
    validate: {
      validator: function(value: Date) {
        return value > this.starts_at;
      },
      message: 'End time must be after start time'
    }
  },
  organizer_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Organizer ID is required']
  },
  category: {
    type: String,
    trim: true,
    lowercase: true,
    default: 'general'
  },
  max_attendees: {
    type: Number,
    min: [1, 'Max attendees must be at least 1'],
    validate: {
      validator: function(value: number) {
        return value == null || value >= this.current_attendees;
      },
      message: 'Max attendees cannot be less than current attendees'
    }
  },
  current_attendees: {
    type: Number,
    default: 0,
    min: [0, 'Current attendees cannot be negative']
  },
  image_url: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: {
      values: ['draft', 'published', 'cancelled', 'completed'],
      message: 'Status must be either draft, published, cancelled, or completed'
    },
    default: 'draft'
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Create indexes for better performance
EventSchema.index({ organizer_id: 1, created_at: -1 });
EventSchema.index({ category: 1, status: 1, starts_at: -1 });
EventSchema.index({ starts_at: -1 });
EventSchema.index({ location: 1 });
EventSchema.index({ status: 1, is_active: 1 });
EventSchema.index({ title: 'text', description: 'text', category: 'text' });

// Virtual for checking if event is full
EventSchema.virtual('is_full').get(function() {
  return this.max_attendees ? this.current_attendees >= this.max_attendees : false;
});

// Virtual for checking if event has ended
EventSchema.virtual('has_ended').get(function() {
  return new Date() > this.ends_at;
});

// Static methods for common queries
EventSchema.statics.findByOrganizer = function(organizerId: string, limit: number = 20) {
  return this.find({ organizer_id: organizerId })
    .sort({ starts_at: -1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.findByCategory = function(category: string, limit: number = 20) {
  return this.find({
    category: { $regex: new RegExp(category, 'i') },
    status: 'published',
    is_active: true,
    starts_at: { $gte: new Date() }
  })
    .sort({ starts_at: 1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.findUpcomingEvents = function(limit: number = 20) {
  return this.find({
    status: 'published',
    is_active: true,
    starts_at: { $gte: new Date() }
  })
    .sort({ starts_at: 1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.findPastEvents = function(limit: number = 20) {
  return this.find({
    status: { $in: ['published', 'completed'] },
    is_active: true,
    starts_at: { $lt: new Date() }
  })
    .sort({ starts_at: -1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.findEventsByDateRange = function(
  startDate: Date,
  endDate: Date,
  limit: number = 20
) {
  return this.find({
    status: 'published',
    is_active: true,
    starts_at: { $gte: startDate, $lte: endDate }
  })
    .sort({ starts_at: 1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.searchEvents = function(query: string, limit: number = 20) {
  return this.find({
    $and: [
      { status: 'published' },
      { is_active: true },
      { $text: { $search: query } }
    ]
  })
    .sort({ score: { $meta: 'textScore' }, starts_at: 1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

EventSchema.statics.findEventsByLocation = function(location: string, limit: number = 20) {
  return this.find({
    location: { $regex: new RegExp(location, 'i') },
    status: 'published',
    is_active: true,
    starts_at: { $gte: new Date() }
  })
    .sort({ starts_at: 1 })
    .limit(limit)
    .populate('organizer_id', 'username avatar_url');
};

// Method to add attendee
EventSchema.methods.addAttendee = function() {
  if (this.max_attendees && this.current_attendees >= this.max_attendees) {
    throw new Error('Event is full');
  }

  return this.updateOne({ $inc: { current_attendees: 1 } });
};

// Method to remove attendee
EventSchema.methods.removeAttendee = function() {
  if (this.current_attendees > 0) {
    return this.updateOne({ $inc: { current_attendees: -1 } });
  }
  return Promise.resolve();
};

// Ensure indexes are created
EventSchema.index({ starts_at: 1 }, { expireAfterSeconds: 0 }); // TTL index for old events

export const Event = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
export default Event;