const { randomUUID } = require('node:crypto');
const { message } = require('../lib/messages');

/** Longer than Vercel's 300 second limit, so a live function never loses its job's lock. */
const LOCK_MS = 310000;

const isFinalAttempt = (job) => job.attemptsMade + 1 >= (job.opts?.attempts || 1);

/** The text stored on a failed audit. Errors can name their own message; otherwise use the generic one. */
function failureMessage(err, audit) {
  if (err?.messageId === 'M-FAIL-CRAWL') return message('M-FAIL-CRAWL', { url: audit?.client?.websiteUrl });
  if (err?.messageId === 'M-FAIL-AI') return message('M-FAIL-AI');
  if (err?.messageId === 'M-FAIL-CONFIG') return message('M-FAIL-CONFIG', { integration: err.integration });
  return message('M-FAIL-GENERIC', { step: audit?.currentStep || 'Waiting to start' });
}

/**
 * Runs one job's audit. Both runners use this, so failures are handled the same way.
 * Only the last attempt marks the audit FAILED; before that, BullMQ will retry it.
 */
async function processAuditJob(job, { runAudit, store, logger }) {
  const { auditId } = job.data;
  try {
    await runAudit(auditId);
  } catch (err) {
    logger.error('audit_attempt_failed', {
      auditId,
      attempt: job.attemptsMade + 1,
      code: err?.code || err?.errorCode || err?.name,
    });
    if (isFinalAttempt(job)) {
      const audit = await store.load(auditId);
      await store.markFailed(auditId, { errorMessage: failureMessage(err, audit) });
    }
    throw err;
  }
}

/**
 * The bounded runner from the spec (sections 3.1 and 6.1): takes at most one job, runs it, and stops.
 * @param {{ queueName: string, createWorker: Function, process: (job: object) => Promise<void>, logger: object }} deps
 * @returns {Promise<{ ran: boolean, auditId?: string, ok?: boolean }>}
 */
async function runNextJob({ queueName, createWorker, process: processJob, logger }) {
  const worker = createWorker(queueName, { lockDuration: LOCK_MS });
  const token = randomUUID();
  try {
    const job = await worker.getNextJob(token, { block: false });
    if (!job) return { ran: false };
    try {
      await processJob(job);
      await job.moveToCompleted('ok', token, false);
      return { ran: true, auditId: job.data.auditId, ok: true };
    } catch (err) {
      await job.moveToFailed(err instanceof Error ? err : new Error(String(err)), token, false);
      return { ran: true, auditId: job.data.auditId, ok: false };
    }
  } catch (err) {
    logger.error('runner_failed', { code: err?.code || err?.name });
    throw err;
  } finally {
    await worker.close();
  }
}

module.exports = { LOCK_MS, isFinalAttempt, failureMessage, processAuditJob, runNextJob };
