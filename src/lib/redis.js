const IORedis = require('ioredis');
const { getEnv } = require('./env');

const Redis = IORedis.default || IORedis.Redis || IORedis;

/**
 * Opens a Redis connection when called, never at import, so `next build` does not need Redis.
 * @param {object} options ioredis options
 */
function createRedis(options = {}) {
  const client = new Redis(getEnv().REDIS_URL, options);
  // Failed commands reject on their own. Without this listener, ioredis also logs every reconnect error.
  client.on('error', () => {});
  return client;
}

module.exports = { createRedis };
