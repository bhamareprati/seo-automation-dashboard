const { Worker } = require('bullmq');
const { chooseAnalysisSource } = require('../ai/analysis');
const { analyzeWithClaude, createAnthropic } = require('../ai/claude');
const { getEnv } = require('../lib/env');
const { logger } = require('../lib/logger');
const { prisma } = require('../lib/prisma');
const { QUEUE_NAME, getAuditQueue } = require('../lib/queue');
const { createRedis } = require('../lib/redis');
const { createAuditStore } = require('./auditStore');
const { cronTick } = require('./cronTick');
const { runAudit } = require('./runAudit');
const { processAuditJob, runNextJob } = require('./runNextJob');
const { createSteps, isStepDone } = require('./steps');

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
    getRedis: async () => {
      const queue = getAuditQueue();
      await queue.waitUntilReady();
      return queue.client;
    },
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

/** The bounded runner: one job, then stop. Used by the routes. */
function runOneJob() {
  return runNextJob({
    queueName: QUEUE_NAME,
    process: processJob,
    logger,
    createWorker: (name, options) => {
      const connection = createRedis({ maxRetriesPerRequest: null });
      const worker = new Worker(name, null, { ...options, connection });
      const close = worker.close.bind(worker);
      worker.close = async () => {
        await close();
        await connection.quit().catch(() => connection.disconnect());
      };
      return worker;
    },
  });
}

/** One cron call. */
function runCronTick() {
  return cronTick({
    getCounts: async () => {
      const queue = getAuditQueue();
      await queue.waitUntilReady();
      return queue.getJobCounts('waiting', 'delayed');
    },
    runJob: runOneJob,
  });
}

module.exports = { QUEUE_NAME, processJob, runOneJob, runCronTick };
