const { Queue } = require('bullmq');
const { createRedis } = require('./redis');

const QUEUE_NAME = 'seo-audit-jobs';
const JOB_NAME = 'run-audit';
const ENQUEUE_TIMEOUT_MS = 8000;

/** One job per audit, so a job can always be found from its audit ID. */
const jobOptions = (auditId) => ({
  jobId: auditId,
  attempts: 2,
  backoff: { type: 'fixed', delay: 30000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
});

let queue;
let connection;

/** Created on first use. The offline queue is off so a route fails fast when Redis is down. */
function getAuditQueue() {
  if (!queue) {
    connection = createRedis({ enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    queue = new Queue(QUEUE_NAME, { connection });
    queue.on('error', () => {});
  }
  return queue;
}

/** The queue's Redis connection, once ready, for small counters like the daily Claude cap. */
async function getQueueRedis() {
  await getAuditQueue().waitUntilReady();
  return connection;
}

async function discardQueue() {
  const stale = queue;
  const staleConnection = connection;
  queue = undefined;
  connection = undefined;
  if (stale) await stale.close().catch(() => {});
  if (staleConnection) staleConnection.disconnect();
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for Redis')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function addJob(auditId) {
  const target = getAuditQueue();
  await target.waitUntilReady();
  await target.add(JOB_NAME, { auditId }, jobOptions(auditId));
}

/** Adds the audit's job. Retries once on a fresh connection, because a warm one may have dropped. */
async function enqueueAudit(auditId) {
  try {
    await withTimeout(addJob(auditId), ENQUEUE_TIMEOUT_MS / 2);
  } catch {
    await discardQueue();
    await withTimeout(addJob(auditId), ENQUEUE_TIMEOUT_MS / 2);
  }
}

module.exports = { QUEUE_NAME, JOB_NAME, jobOptions, getAuditQueue, getQueueRedis, enqueueAudit };
