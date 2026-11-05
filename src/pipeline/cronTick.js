/**
 * What one cron call does.
 *
 * cron-job.org calls every minute, but Neon's free compute allowance would run out if Postgres were
 * queried that often. So a tick reads Redis first, and only touches Postgres once an hour when idle.
 *
 * @param {{
 *   claimHourlyCheck: () => Promise<boolean>,
 *   runHourlyCheck: () => Promise<unknown>,
 *   getCounts: () => Promise<{ waiting: number, delayed: number, active: number }>,
 *   runStalledCheck: () => Promise<unknown>,
 *   runJob: () => Promise<object>,
 * }} deps
 */
async function cronTick({ claimHourlyCheck, runHourlyCheck, getCounts, runStalledCheck, runJob }) {
  if (await claimHourlyCheck()) await runHourlyCheck();

  const counts = await getCounts();
  // A function killed mid-audit leaves its job active with an expired lock. This returns it to the queue.
  if (counts.active > 0) await runStalledCheck();
  if (counts.waiting + counts.delayed === 0) return { ran: false };
  return runJob();
}

module.exports = { cronTick };
