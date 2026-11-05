const crypto = require('node:crypto');

const digest = (value) => crypto.createHash('sha256').update(value).digest();

/** Compares in constant time. Hashing first means the lengths always match. */
function secretMatches(provided, expected) {
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

/**
 * GET /api/cron/audits. cron-job.org gives up after 30 seconds and disables a job after repeated
 * failures, so this replies straight away and the work continues in the background.
 * @param {Request} request
 * @param {{ env: object, runInBackground: (work: () => Promise<unknown>) => void, tick: () => Promise<unknown> }} deps
 */
async function handleCronTick(request, { env, runInBackground, tick }) {
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!provided || !secretMatches(provided, env.CRON_SECRET)) {
    return Response.json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  runInBackground(tick);
  return Response.json({ accepted: true });
}

module.exports = { handleCronTick };
