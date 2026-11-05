const { Worker } = require('bullmq');
const { chooseAnalysisSource } = require('../ai/analysis');
const { analyzeWithClaude, createAnthropic } = require('../ai/claude');
const { createAuditIfIdle } = require('../lib/audits');
const { getEnv } = require('../lib/env');
const { logger } = require('../lib/logger');
const { prisma } = require('../lib/prisma');
const { QUEUE_NAME, enqueueAudit, getAuditQueue, getQueueRedis } = require('../lib/queue');
const { createRedis } = require('../lib/redis');
const { launchBrowser } = require('../reports/render');
const { createAuditStore } = require('./auditStore');
const { cronTick } = require('./cronTick');
const { runAudit } = require('./runAudit');
const { processAuditJob, runNextJob } = require('./runNextJob');
const { enqueueDueAudits, reconcileStuckAudits } = require('./schedule');
const { createSteps, isStepDone } = require('./steps');

const HOURLY_CHECK_KEY = 'cron:monthly';
const STALLED_INTERVAL_MS = 30000;

/** Connects the pipeline to the real database and steps. Everything is created on first use. */
function auditDependencies() {
  const env = getEnv();
  const store = createAuditStore(prisma);
  const steps = createSteps({
    store,
    env,
    usedMocks: env.useMocks,
    delayMs: env.MOCK_STEP_DELAY_MS,
    timeoutMs: env.CRAWL_REQUEST_TIMEOUT_MS,
    logger,
    reportsDir: env.REPORTS_DIR,
    launchBrowser: () => launchBrowser(env),
    getRedis: getQueueRedis,
    analyzeWithClaude: (input) =>
      analyzeWithClaude(input, { anthropic: createAnthropic(env.ANTHROPIC_API_KEY), model: env.ANTHROPIC_MODEL }),
  });
  return {
    store,
    logger,
    runAudit: (auditId) =>
      runAudit(auditId, {
        store,
        steps,
        isStepDone,
        usesSampleAnalysis: chooseAnalysisSource(env) === 'mock',
        logger,
      }),
  };
}

/** Handles one job's audit. Used directly by the long-running worker. */
const processJob = (job) => processAuditJob(job, auditDependencies());

/** A short-lived worker with its own connection, closed together. */
function createManualWorker(name, options) {
  const connection = createRedis({ maxRetriesPerRequest: null });
  const worker = new Worker(name, null, { ...options, connection });
  worker.on('error', () => {});
  const close = worker.close.bind(worker);
  worker.close = async () => {
    await close();
    await connection.quit().catch(() => connection.disconnect());
  };
  return worker;
}

/** The bounded runner: one job, then stop. Used by the routes. */
function runOneJob() {
  return runNextJob({ queueName: QUEUE_NAME, process: processJob, logger, createWorker: createManualWorker });
}

/** Returns jobs whose lock expired to the queue. BullMQ runs this check once when it is called. */
async function runStalledCheck({ stalledIntervalMs = STALLED_INTERVAL_MS } = {}) {
  const worker = createManualWorker(QUEUE_NAME, { stalledInterval: stalledIntervalMs, maxStalledCount: 1 });
  try {
    await worker.waitUntilReady();
    await worker.startStalledCheckTimer();
  } finally {
    await worker.close();
  }
}

async function getJobState(auditId) {
  const job = await getAuditQueue().getJob(auditId);
  return job ? job.getState() : null;
}

/** Starts monthly audits that are due, and clears any stuck rows. */
async function runHourlyCheck() {
  const env = getEnv();
  const now = new Date();
  await enqueueDueAudits({
    prisma,
    createAuditIfIdle,
    enqueue: enqueueAudit,
    now,
    intervalDays: env.AUDIT_INTERVAL_DAYS,
    logger,
  });
  await reconcileStuckAudits({ prisma, getJobState, now, logger });
}

/** One cron call. */
function runCronTick() {
  return cronTick({
    claimHourlyCheck: async () => {
      const redis = await getQueueRedis();
      return (await redis.set(HOURLY_CHECK_KEY, '1', 'EX', 3600, 'NX')) === 'OK';
    },
    runHourlyCheck,
    getCounts: async () => {
      const queue = getAuditQueue();
      await queue.waitUntilReady();
      return queue.getJobCounts('waiting', 'delayed', 'active');
    },
    runStalledCheck,
    runJob: runOneJob,
  });
}

module.exports = { QUEUE_NAME, HOURLY_CHECK_KEY, processJob, runOneJob, runCronTick, runStalledCheck, runHourlyCheck };
