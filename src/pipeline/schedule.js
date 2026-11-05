const { ACTIVE_STATUSES } = require('../lib/auditSteps');
const { message } = require('../lib/messages');

const DAY_MS = 24 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 20 * 60 * 1000;
const LIVE_JOB_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

/**
 * A client is due when their latest audit, or their creation date if they have none,
 * is older than the interval. The spec's schema has no schedule column, so this needs none.
 */
function isDue(client, now, intervalDays) {
  const baseline = client.audits[0]?.createdAt || client.createdAt;
  return now.getTime() - new Date(baseline).getTime() > intervalDays * DAY_MS;
}

/**
 * Starts an audit for each client that is due. Runs at most once an hour. If two ever overlap,
 * createAuditIfIdle still allows only one active audit per client.
 * @param {{ prisma: object, createAuditIfIdle: Function, enqueue: Function, now: Date, intervalDays: number, logger: object }} deps
 * @returns {Promise<string[]>} the IDs of the audits started
 */
async function enqueueDueAudits({ prisma, createAuditIfIdle, enqueue, now, intervalDays, logger }) {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      createdAt: true,
      audits: { take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true } },
    },
  });

  const started = [];
  for (const client of clients.filter((c) => isDue(c, now, intervalDays))) {
    const { created, auditId } = await createAuditIfIdle(prisma, client.id, 'cron');
    if (created) {
      // If this fails, the row is caught later by reconcileStuckAudits.
      await enqueue(auditId);
      started.push(auditId);
      logger.info('monthly_audit_enqueued', { auditId, clientId: client.id });
    }
  }
  return started;
}

/**
 * Marks audits FAILED when they have sat active for over 20 minutes with no live job behind them.
 * A row stuck like this would otherwise block that client from ever running another audit.
 * @param {{ prisma: object, getJobState: (auditId: string) => Promise<string|null>, now: Date, logger: object }} deps
 * @returns {Promise<string[]>} the IDs of the audits marked FAILED
 */
async function reconcileStuckAudits({ prisma, getJobState, now, logger }) {
  const candidates = await prisma.audit.findMany({
    where: { status: { in: ACTIVE_STATUSES }, createdAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    select: { id: true, currentStep: true },
  });

  const failed = [];
  for (const audit of candidates) {
    const state = await getJobState(audit.id);
    if (!LIVE_JOB_STATES.has(state)) {
      await prisma.audit.update({
        where: { id: audit.id },
        data: {
          status: 'FAILED',
          errorMessage: message('M-FAIL-GENERIC', { step: audit.currentStep || 'Waiting to start' }),
        },
      });
      failed.push(audit.id);
      logger.warn('stuck_audit_failed', { auditId: audit.id });
    }
  }
  return failed;
}

module.exports = { isDue, enqueueDueAudits, reconcileStuckAudits, STUCK_AFTER_MS };
