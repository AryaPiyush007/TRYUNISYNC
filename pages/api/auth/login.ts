import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/mongodb';
import { generateToken } from '@/lib/auth';
import { authLimiter } from '@/lib/rateLimiter';
import { isValidEmail, successResponse, errorResponse } from '@/lib/utils';
import User from '@/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  await new Promise((resolve) => authLimiter(req, res, resolve));

  if (req.method !== 'POST') {
    return errorResponse(res, 'Method not allowed', 405);
  }

  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return errorResponse(res, 'Email and password are required');
    }

    if (!isValidEmail(email)) {
      return errorResponse(res, 'Please enter a valid email address');
    }

    if (typeof password !== 'string' || password.length < 1) {
      return errorResponse(res, 'Password is required');
    }

    // Connect to database
    await connectDB();

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.is_active) {
      return errorResponse(res, 'Account is not active', 401);
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 'Invalid email or password', 401);
    }

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
      branch: user.branch
    };

    return successResponse(
      res,
      { user: userData, token },
      'Login successful'
    );

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Login failed. Please try again.', 500);
  }
}