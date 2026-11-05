const { AUDIT_STEPS } = require('../lib/auditSteps');
const { NotFoundError } = require('../lib/errors');

/**
 * Runs one audit through every step, in the spec's order. This is the only code that knows the steps;
 * runners just fetch a job and call it. Progress never goes backwards, even on a retry.
 * @param {string} auditId
 * @param {{ store: object, steps: Record<string, Function>, isStepDone?: Function, usesSampleAnalysis?: boolean, logger: object, now?: () => Date }} deps
 */
async function runAudit(
  auditId,
  { store, steps, isStepDone = () => false, usesSampleAnalysis = false, logger, now = () => new Date() },
) {
  const audit = await store.load(auditId);
  if (!audit) throw new NotFoundError(`Audit ${auditId} not found`);
  if (audit.status === 'COMPLETED' && !isRetryable(audit)) return { skipped: true };

  await store.markRunning(auditId);

  const context = { audit, signals: audit.signals || null, stepMs: {} };
  let progress = audit.progress;
  for (const step of AUDIT_STEPS) {
    if (isStepDone(step.key, audit)) {
      // Saved by an earlier attempt, so it isn't repeated or paid for twice.
      progress = Math.max(progress, step.progress);
      continue;
    }
    // Never say "Analysing with Claude" when Claude isn't being used.
    const currentStep = usesSampleAnalysis && step.sampleLabel ? step.sampleLabel : step.label;
    await store.setStep(auditId, { currentStep, progress });
    const startedAt = Date.now();
    await steps[step.key](context);
    const ms = Date.now() - startedAt;
    context.stepMs[step.key] = ms;
    logger.info('audit_step', { auditId, step: step.key, ms });
    progress = Math.max(progress, step.progress);
  }

  await store.markCompleted(auditId, {
    completedAt: now(),
    signals: withStepTimes(context),
    note: context.completionNote,
  });
  return { skipped: false };
}

/** A completed audit only runs again when its PDF is missing (docs/TRD.md section 9.3). */
const isRetryable = (audit) => Boolean(audit.result) && !audit.report;

/** Adds this run's timings to the signals, keeping any timings from an earlier attempt. */
function withStepTimes({ signals, stepMs }) {
  if (!signals?.meta) return undefined;
  return { ...signals, meta: { ...signals.meta, stepMs: { ...signals.meta.stepMs, ...stepMs } } };
}

module.exports = { runAudit };
