import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve('./src') },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.js'],
    // Test files run in parallel, and some start real Chrome, so a busy machine can slow an ordinary test.
    testTimeout: 20000,
  },
});
