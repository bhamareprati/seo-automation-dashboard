/**
 * What one cron call does. Monthly scheduling and recovery are added in Phase 7.
 * An idle tick reads job counts from Redis and stops, without touching Postgres.
 * @param {{ getCounts: () => Promise<{ waiting: number, delayed: number }>, runJob: () => Promise<object> }} deps
 */
async function cronTick({ getCounts, runJob }) {
  const counts = await getCounts();
  if (counts.waiting + counts.delayed === 0) return { ran: false };
  return runJob();
}

module.exports = { cronTick };
