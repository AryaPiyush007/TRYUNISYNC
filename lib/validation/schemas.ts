import Joi from 'joi';

// Common validation patterns
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// User validation schemas
export const userRegistrationSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Username can only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 30 characters',
      'any.required': 'Username is required'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .pattern(passwordPattern)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least 1 letter and 1 number',
      'any.required': 'Password is required'
    }),
  college: Joi.string()
    .max(100)
    .optional()
    .allow(''),
  year: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional(),
  branch: Joi.string()
    .max(50)
    .optional()
    .allow('')
});

export const userLoginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

export const userUpdateSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .optional(),
  bio: Joi.string()
    .max(500)
    .optional()
    .allow(''),
  college: Joi.string()
    .max(100)
    .optional()
    .allow(''),
  year: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional(),
  branch: Joi.string()
    .max(50)
    .optional()
    .allow('')
});

// Upload validation schemas
export const uploadCreateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Title cannot be empty',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .max(1000)
    .optional()
    .allow(''),
  course: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
    'any.required': 'Course is required'
  }),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  visibility: Joi.string()
    .valid('public', 'private', 'course_only')
    .default('public')
});

export const uploadUpdateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .optional(),
  description: Joi.string()
    .max(1000)
    .optional()
    .allow(''),
  course: Joi.string()
    .min(1)
    .max(100)
    .optional(),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  visibility: Joi.string()
    .valid('public', 'private', 'course_only')
    .optional()
});

// Marketplace validation schemas
export const marketplaceCreateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .min(1)
    .max(2000)
    .required()
    .messages({
      'any.required': 'Description is required'
    }),
  price: Joi.number()
    .min(0)
    .required()
    .messages({
      'any.required': 'Price is required'
    }),
  category: Joi.string()
    .max(50)
    .optional(),
  condition: Joi.string()
    .valid('new', 'like_new', 'good', 'fair', 'poor')
    .required()
    .messages({
      'any.required': 'Condition is required'
    }),
  location: Joi.string()
    .max(100)
    .optional()
    .allow(''),
  is_negotiable: Joi.boolean()
    .default(false)
});

export const marketplaceUpdateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .optional(),
  description: Joi.string()
    .min(1)
    .max(2000)
    .optional(),
  price: Joi.number()
    .min(0)
    .optional(),
  category: Joi.string()
    .max(50)
    .optional(),
  condition: Joi.string()
    .valid('new', 'like_new', 'good', 'fair', 'poor')
    .optional(),
  location: Joi.string()
    .max(100)
    .optional()
    .allow(''),
  is_negotiable: Joi.boolean()
    .optional(),
  image_urls: Joi.array()
    .items(Joi.string().uri())
    .max(5)
    .optional()
});

// Event validation schemas
export const eventCreateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .min(1)
    .max(2000)
    .required()
    .messages({
      'any.required': 'Description is required'
    }),
  location: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'any.required': 'Location is required'
    }),
  starts_at: Joi.date()
    .iso()
    .min('now')
    .required()
    .messages({
      'any.required': 'Start time is required',
      'date.min': 'Start time must be in the future'
    }),
  ends_at: Joi.date()
    .iso()
    .min(Joi.ref('starts_at'))
    .required()
    .messages({
      'any.required': 'End time is required',
      'date.min': 'End time must be after start time'
    }),
  category: Joi.string()
    .max(50)
    .optional(),
  max_attendees: Joi.number()
    .integer()
    .min(1)
    .optional()
});

export const eventUpdateSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .optional(),
  description: Joi.string()
    .min(1)
    .max(2000)
    .optional(),
  location: Joi.string()
    .min(1)
    .max(200)
    .optional(),
  starts_at: Joi.date()
    .iso()
    .optional(),
  ends_at: Joi.date()
    .iso()
    .min(Joi.ref('starts_at'))
    .optional(),
  category: Joi.string()
    .max(50)
    .optional(),
  max_attendees: Joi.number()
    .integer()
    .min(1)
    .optional()
    .allow(null)
});

// Comment validation schemas
export const commentCreateSchema = Joi.object({
  target_type: Joi.string()
    .valid('upload', 'marketplace_item', 'event')
    .required()
    .messages({
      'any.required': 'Target type is required'
    }),
  target_id: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Invalid target ID format',
      'any.required': 'Target ID is required'
    }),
  content: Joi.string()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Comment cannot be empty',
      'string.max': 'Comment cannot exceed 1000 characters',
      'any.required': 'Content is required'
    }),
  parent_id: Joi.string()
    .pattern(objectIdPattern)
    .optional()
});

export const commentUpdateSchema = Joi.object({
  content: Joi.string()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Comment cannot be empty',
      'string.max': 'Comment cannot exceed 1000 characters',
      'any.required': 'Content is required'
    })
});

// Like validation schemas
export const likeCreateSchema = Joi.object({
  target_type: Joi.string()
    .valid('upload', 'marketplace_item', 'event')
    .required()
    .messages({
      'any.required': 'Target type is required'
    }),
  target_id: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Invalid target ID format',
      'any.required': 'Target ID is required'
    })
});

// Follow validation schemas
export const followCreateSchema = Joi.object({
  following_id: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required'
    })
});

// Query parameter validation schemas
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
});

export const uploadListQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  course: Joi.string()
    .optional(),
  tags: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.string())
    )
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  sort: Joi.string()
    .valid('newest', 'oldest', 'most_downloaded', 'highest_rated')
    .default('newest')
});

export const marketplaceListQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  category: Joi.string()
    .optional(),
  condition: Joi.string()
    .valid('new', 'like_new', 'good', 'fair', 'poor')
    .optional(),
  min_price: Joi.number()
    .min(0)
    .optional(),
  max_price: Joi.number()
    .min(0)
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  sort: Joi.string()
    .valid('newest', 'oldest', 'price_low', 'price_high')
    .default('newest')
});

export const eventListQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  category: Joi.string()
    .optional(),
  start_date: Joi.date()
    .iso()
    .optional(),
  end_date: Joi.date()
    .iso()
    .optional(),
  status: Joi.string()
    .valid('published', 'completed', 'upcoming')
    .default('upcoming')
});

export const feedQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  type: Joi.string()
    .valid('all', 'uploads', 'marketplace', 'events')
    .default('all'),
  timeframe: Joi.string()
    .valid('all', 'today', 'week', 'month')
    .default('all')
});

// Validation helper function
export function validateRequest(schema: Joi.ObjectSchema, data: any, location: string = 'body') {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      location
    }));

    const errorMessages = details.map(d => `${d.location}.${d.field}: ${d.message}`);
    throw new Error(`Validation failed: ${errorMessages.join(', ')}`);
  }

  return value;
}