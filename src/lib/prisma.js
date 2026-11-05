const { PrismaClient } = require('@prisma/client');
const { withDbRetry } = require('./dbRetry');

function createClient() {
  return new PrismaClient().$extends({
    query: {
      $allOperations({ args, query }) {
        return withDbRetry(() => query(args));
      },
    },
  });
}

// One client per process. Next.js hot reload would otherwise create a new one on every edit.
const store = globalThis;
const prisma = store.__seoDashboardPrisma || createClient();
store.__seoDashboardPrisma = prisma;

module.exports = { prisma };
