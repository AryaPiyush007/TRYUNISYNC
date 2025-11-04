/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['res.cloudinary.com'],
  },
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimits: {
      api: {
        size: '10mb',
      },
    },
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

module.exports = nextConfig