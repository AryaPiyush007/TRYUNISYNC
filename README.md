# UniSync Backend

Complete Next.js backend implementation for UniSync college platform with JWT authentication, file uploads, marketplace, events, and social features.

## Features

- **JWT Authentication**: Secure user registration, login, and profile management
- **File Uploads**: Cloudinary integration for PDF, DOC, image files with size limits
- **MongoDB Atlas**: Scalable database with Mongoose ODM
- **Marketplace**: Buy/sell items with image uploads and pricing
- **Events**: Create and manage college events with attendance tracking
- **Social Features**: Comments, likes, and user following system
- **Feed Aggregation**: Combined feed of all content with filtering
- **Rate Limiting**: Redis-based rate limiting with in-memory fallback
- **Security**: Input validation, CORS, and file type restrictions

## Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Cloudinary account
- Redis account (Upstash recommended for Vercel)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Fill in your environment variables (see Environment Variables section below)

5. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/`

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/unisync?retryWrites=true&w=majority

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long

# File Upload Settings
MAX_FILE_SIZE_BYTES=10485760

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_MS=60000

# Redis (Upstash for Vercel deployment)
REDIS_URL=redis://default:password@host:port

# CORS
NEXT_PUBLIC_API_URL=http://localhost:3000
NODE_ENV=development
```

## API Endpoints

### Authentication

#### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "Test123456",
  "college": "Test College",
  "year": 2,
  "branch": "CS"
}
```

#### Login User
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456"
}
```

#### Get User Profile
```bash
GET /api/auth/profile
Authorization: Bearer <jwt_token>
```

### File Uploads

#### Upload File
```bash
POST /api/uploads
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

file: <file>
title: "Document Title"
description: "Optional description"
course: "Computer Science"
tags: "notes,programming"
visibility: "public"
```

#### List Uploads
```bash
GET /api/uploads?page=1&limit=20&course=CS&search=notes&sort=newest
```

#### Get Upload Details
```bash
GET /api/uploads/[id]
```

#### Update Upload
```bash
PUT /api/uploads/[id]
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description"
}
```

#### Delete Upload
```bash
DELETE /api/uploads/[id]
Authorization: Bearer <jwt_token>
```

### Marketplace

#### Create Listing
```bash
POST /api/marketplace
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

title: "Item Title"
description: "Item description"
price: 99.99
category: "electronics"
condition: "good"
images: <image_files>
is_negotiable: true
```

#### List Marketplace Items
```bash
GET /api/marketplace?page=1&limit=20&category=electronics&min_price=10&max_price=100
```

#### Get Marketplace Item
```bash
GET /api/marketplace/[id]
```

### Events

#### Create Event
```bash
POST /api/events
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

title: "Event Title"
description: "Event description"
location: "College Auditorium"
starts_at: "2024-12-25T10:00:00Z"
ends_at: "2024-12-25T12:00:00Z"
category: "workshop"
max_attendees: 100
image: <image_file>
```

#### List Events
```bash
GET /api/events?page=1&limit=20&status=upcoming&category=workshop
```

#### Attend Event
```bash
POST /api/events/[id]/attend
Authorization: Bearer <jwt_token>
```

### Social Features

#### Add Comment
```bash
POST /api/comments
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "target_type": "upload",
  "target_id": "upload_id",
  "content": "Great resource!",
  "parent_id": null
}
```

#### Like/Unlike Content
```bash
POST /api/likes
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "target_type": "upload",
  "target_id": "upload_id"
}

DELETE /api/likes?target_type=upload&target_id=upload_id
Authorization: Bearer <jwt_token>
```

#### Follow/Unfollow User
```bash
POST /api/follow
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "following_id": "user_id"
}

DELETE /api/follow?following_id=user_id
Authorization: Bearer <jwt_token>
```

### Feed

#### Get Combined Feed
```bash
GET /api/feed?page=1&limit=20&type=all&timeframe=week
```

## Database Schema

### Users Collection
```typescript
{
  username: string (unique, 3-30 chars),
  email: string (unique, valid email),
  password: string (bcrypt hashed),
  avatar_url?: string,
  bio?: string,
  college?: string,
  year?: number (1-4),
  branch?: string,
  is_active: boolean,
  created_at: Date,
  updated_at: Date
}
```

### Uploads Collection
```typescript
{
  title: string (required, max 200 chars),
  description?: string (max 1000 chars),
  file_url: string (Cloudinary URL),
  file_type: string,
  file_size: number,
  course: string (required),
  tags: string[],
  uploader_id: ObjectId,
  visibility: 'public' | 'private' | 'course_only',
  download_count: number,
  rating: number (0-5),
  is_active: boolean,
  created_at: Date,
  updated_at: Date
}
```

## Deployment

### Vercel Deployment

1. **Push to GitHub**:
```bash
git add .
git commit -m "Initial backend implementation"
git push origin main
```

2. **Connect to Vercel**:
   - Sign up/login to Vercel
   - Import your GitHub repository
   - Configure environment variables in Vercel dashboard

3. **Environment Variables**:
   Set these in Vercel dashboard:
   ```
   MONGODB_URI=
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   JWT_SECRET=
   REDIS_URL=
   ```

4. **Deploy**:
   Vercel will automatically deploy on push to main branch

## Security Considerations

### Production Security Checklist
- [ ] Environment variables are properly set
- [ ] JWT secret is strong and private
- [ ] MongoDB Atlas network access is restricted
- [ ] Cloudinary API keys are secured
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Input validation is implemented
- [ ] Error messages don't leak sensitive information
- [ ] HTTPS is enforced (automatic on Vercel)

## Rate Limiting

Different endpoints have different rate limits:
- **General API**: 60 requests per minute
- **Uploads**: 5 uploads per 10 minutes
- **Authentication**: 5 attempts per minute
- **Comments**: 10 comments per minute
- **Marketplace**: 5 listings per hour

## File Upload Limits

- **Maximum file size**: 10MB (configurable via MAX_FILE_SIZE_BYTES)
- **Allowed file types**: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG, TXT
- **Maximum images per marketplace listing**: 5
- **Automatic image optimization** via Cloudinary

## Testing

### Manual Testing Examples

#### Test Authentication
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test123456"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456"}'
```

#### Test File Upload
```bash
# Upload file
curl -X POST http://localhost:3000/api/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@test.pdf" \
  -F "title=Test Document" \
  -F "course=Computer Science"
```

### Validation Tests
- [ ] Upload below limit → ✅ success
- [ ] Upload above limit → ❌ 413
- [ ] Too many requests → ❌ 429
- [ ] Invalid credentials → ❌ 401
- [ ] Valid token → ✅ access granted

## Troubleshooting

### Common Issues

**MongoDB Connection Failed**
- Check MONGODB_URI format
- Verify network access in MongoDB Atlas
- Ensure username/password are correct

**Cloudinary Upload Failed**
- Verify CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET
- Check file size limits
- Ensure supported file types

**Rate Limiting Errors**
- Implement proper backoff in client
- Check REDIS_URL if using Redis
- Verify rate limit configurations

**JWT Token Issues**
- Ensure JWT_SECRET is at least 32 characters
- Check token expiration (7 days)
- Verify Authorization header format: "Bearer <token>"

## License

This project is part of UniSync platform developed for educational purposes.

## Contributing

A SECOND YEAR PROJECT BY OMKRRISH, OMKAR, PIYUSH, NIKETH
