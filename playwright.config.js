const { defineConfig } = require('@playwright/test');

// Uses the installed Chrome, so no browser download is needed. Set E2E_BASE_URL to test the live site.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 180000,
  // The first database connection from a developer machine can take over 6 s, so checks wait up to 15 s.
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/api/health',
        reuseExistingServer: true,
        timeout: 120000,
      },
});
