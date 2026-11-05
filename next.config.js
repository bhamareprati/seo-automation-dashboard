const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
    // Chromium's compressed binary isn't found by tracing, so it has to be listed for the functions that run audits.
    outputFileTracingIncludes: {
      '/api/audit': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/audit/[id]/retry': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/cron/audits': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

module.exports = nextConfig;
