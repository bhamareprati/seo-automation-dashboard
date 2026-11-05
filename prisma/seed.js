const { PrismaClient } = require('@prisma/client');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo clients. All contact details are placeholders.
 * @param {Date} now
 */
function seedClients(now = new Date()) {
  return [
    {
      // Main demo. Uses the crawl fixture and matches the spec's mock data.
      name: 'Example Dental Clinic',
      websiteUrl: 'https://example-dental-clinic.com',
      businessType: 'Dental clinic',
      city: 'Pune',
      state: 'Maharashtra',
      whatsapp: '+910000000001',
      email: 'client@demo.test',
    },
    {
      // Second account for isolation tests. example.com is reserved for documentation, so it is safe to crawl.
      name: 'Demo Client',
      websiteUrl: 'https://example.com',
      businessType: 'Other',
      city: 'Mumbai',
      state: 'Maharashtra',
      whatsapp: null,
      email: 'client2@demo.test',
    },
    {
      // Created 31 days ago, so the monthly cron has a client that is due.
      name: 'Overdue Dental',
      websiteUrl: 'https://overdue-dental.example',
      businessType: 'Dental clinic',
      city: 'Pune',
      state: 'Maharashtra',
      whatsapp: '+910000000003',
      email: 'client3@demo.test',
      createdAt: new Date(now.getTime() - 31 * DAY_MS),
    },
  ];
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const client of seedClients()) {
      // Existing rows are left alone, so re-running never resets a client's dates.
      await prisma.client.upsert({ where: { websiteUrl: client.websiteUrl }, update: {}, create: client });
    }
    process.stdout.write(`Seeded ${seedClients().length} clients\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Seed failed: ${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { seedClients };
