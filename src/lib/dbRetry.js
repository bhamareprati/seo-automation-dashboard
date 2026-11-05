const RETRY_DELAYS_MS = [500, 1500];

// Only failures where the query never reached the database, so running it again can't double a write.
const NOT_CONNECTED_CODES = new Set(['P1001', 'P1002', 'P2024']);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isNotConnectedError(err) {
  return (
    err?.name === 'PrismaClientInitializationError' ||
    NOT_CONNECTED_CODES.has(err?.code) ||
    NOT_CONNECTED_CODES.has(err?.errorCode)
  );
}

/**
 * Runs a database call, retrying briefly when no connection could be made. Neon sleeps when idle,
 * and a first connection can be slow, so this is expected now and then.
 * @template T
 * @param {() => Promise<T>} work
 * @param {{ sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
async function withDbRetry(work, { sleep = pause } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      if (!isNotConnectedError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

module.exports = { withDbRetry, isNotConnectedError };
