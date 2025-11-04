/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['res.cloudinary.com'],
  },
  // Set body parser size limit for API routes
  experimental: {
    serverComponentsExternalPackages: []
  },
  // Configure API body parser size limit
  async rewrites() {
    return [];
  },
  // Configure response size limits via custom server middleware
  // Note: body parser size limits are set in individual API route handlers
}

module.exports = nextConfig