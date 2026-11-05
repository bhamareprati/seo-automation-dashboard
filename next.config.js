/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // These run on the server only, so Next.js must not bundle them.
    serverComponentsExternalPackages: [
      'bullmq',
      'ioredis',
      '@prisma/client',
      'prisma',
      'puppeteer-core',
      '@sparticuz/chromium',
    ],
  },
};

module.exports = nextConfig;
