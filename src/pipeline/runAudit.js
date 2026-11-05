const { AUDIT_STEPS } = require('../lib/auditSteps');
const { NotFoundError } = require('../lib/errors');

/**
 * Runs one audit through every step, in the spec's order. This is the only code that knows the steps;
 * runners just fetch a job and call it. Progress never goes backwards, even on a retry.
 * @param {string} auditId
 * @param {{ store: object, steps: Record<string, Function>, logger: object, now?: () => Date }} deps
 */
async function runAudit(auditId, { store, steps, logger, now = () => new Date() }) {
  const audit = await store.load(auditId);
  if (!audit) throw new NotFoundError(`Audit ${auditId} not found`);
  if (audit.status === 'COMPLETED') return { skipped: true };

  await store.markRunning(auditId);

  const context = { audit };
  let progress = audit.progress;
  for (const step of AUDIT_STEPS) {
    await store.setStep(auditId, { currentStep: step.label, progress });
    const startedAt = Date.now();
    await steps[step.key](context);
    logger.info('audit_step', { auditId, step: step.key, ms: Date.now() - startedAt });
    progress = Math.max(progress, step.progress);
  }

  await store.markCompleted(auditId, { completedAt: now() });
  return { skipped: false };
}

module.exports = { runAudit };
