import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { generateToken } from '@/lib/auth';
import { authLimiter } from '@/lib/rateLimiter';
import { isValidEmail, isStrongPassword, sanitizeString, successResponse, errorResponse } from '@/lib/utils';
import User from '@/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  await new Promise((resolve) => authLimiter(req, res, resolve));

  if (req.method !== 'POST') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  try {
    const {
      username,
      email,
      password,
      college,
      year,
      branch
    } = req.body;

    // Validation
    if (!username || !email || !password) {
      return errorResponse(res, 'Username, email, and password are required');
    }

    if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
      return errorResponse(res, 'Username must be between 3 and 30 characters');
    }

    if (!isValidEmail(email)) {
      return errorResponse(res, 'Please enter a valid email address');
    }

    if (!isStrongPassword(password)) {
      return errorResponse(res, 'Password must be at least 8 characters long and contain at least 1 letter and 1 number');
    }

    // Sanitize inputs
    const sanitizedUsername = sanitizeString(username);
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedCollege = college ? sanitizeString(college) : '';
    const sanitizedBranch = branch ? sanitizeString(branch) : '';

    // Validate year if provided
    if (year && (isNaN(year) || year < 1 || year > 4)) {
      return errorResponse(res, 'Year must be a number between 1 and 4');
    }

    // Connect to database
    await connectDB();

    // Check if user already exists
    const existingUserByEmail = await User.findOne({ email: sanitizedEmail });
    if (existingUserByEmail) {
      return errorResponse(res, 'Email already exists', 409);
    }

    const existingUserByUsername = await User.findOne({ username: sanitizedUsername });
    if (existingUserByUsername) {
      return errorResponse(res, 'Username already exists', 409);
    }

    // Create new user
    const user = new User({
      username: sanitizedUsername,
      email: sanitizedEmail,
      password, // Will be hashed by pre-save hook
      college: sanitizedCollege,
      year: year ? parseInt(year) : undefined,
      branch: sanitizedBranch
    });

    await user.save();

    // Generate JWT token
    const token = generateToken(user._id.toString());

    // Return user data (excluding password) and token
    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      bio: user.bio,
      college: user.college,
      year: user.year,
      branch: user.branch,
      created_at: user.created_at
    };

    return successResponse(
      res,
      { user: userData, token },
      'User registered successfully',
      201
    );

  } catch (error: any) {
    console.error('Registration error:', error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldMap: { [key: string]: string } = {
        email: 'Email',
        username: 'Username'
      };

      return errorResponse(
        res,
        `${fieldMap[field] || field} already exists`,
        409
      );
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      return errorResponse(res, errors.join(', '));
    }

    return errorResponse(res, 'Registration failed. Please try again.', 500);
  }
}