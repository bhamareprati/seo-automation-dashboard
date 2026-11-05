const { PrismaClient } = require('@prisma/client');

// One client per process. Next.js hot reload would otherwise create a new one on every edit.
const store = globalThis;
const prisma = store.__seoDashboardPrisma || new PrismaClient();
store.__seoDashboardPrisma = prisma;

module.exports = { prisma };
