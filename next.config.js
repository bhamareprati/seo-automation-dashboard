/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 14 has unpatched critical advisories in the image optimizer, and the app doesn't use it.
  images: { unoptimized: true },
  experimental: {
    // These run on the server only, so Next.js must not bundle them.
    serverComponentsExternalPackages: [
      '@anthropic-ai/sdk',
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
