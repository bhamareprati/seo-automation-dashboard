// Long-running worker for local development: npm run worker
// Production uses the bounded runner instead (docs/TRD.md section 8.1). Same pipeline, different trigger.
const { Worker } = require('bullmq');
const { createRedis } = require('../src/lib/redis');
const { QUEUE_NAME, processJob } = require('../src/pipeline');

const worker = new Worker(QUEUE_NAME, processJob, {
  connection: createRedis({ maxRetriesPerRequest: null }),
  concurrency: 1,
  // An idle worker polls Redis, and the free plan averages about 11.6 commands a minute.
  drainDelay: 60, // seconds
  stalledInterval: 300000, // milliseconds
});

worker.on('ready', () => console.log(`Worker ready on queue ${QUEUE_NAME}`));
worker.on('completed', (job) => console.log(`Completed audit ${job.data.auditId}`));
worker.on('failed', (job, err) => console.log(`Attempt failed for audit ${job?.data?.auditId}: ${err.name}`));
worker.on('error', (err) => console.log(`Worker error: ${err.name}`));

async function shutDown() {
  await worker.close();
  process.exit(0);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
