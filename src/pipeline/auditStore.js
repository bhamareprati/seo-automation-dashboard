/**
 * Every write the pipeline makes to an Audit row.
 * @param {object} prisma
 */
function createAuditStore(prisma) {
  const update = (id, data) => prisma.audit.update({ where: { id }, data });
  return {
    load: (id) => prisma.audit.findUnique({ where: { id }, include: { client: true } }),
    markRunning: (id) => update(id, { status: 'RUNNING', errorMessage: null, completedAt: null }),
    setStep: (id, { currentStep, progress }) => update(id, { currentStep, progress }),
    saveSignals: (id, signals) => update(id, { signals }),
    saveResult: (id, { result, overallScore, scoreBreakdown, signals }) =>
      update(id, { result, overallScore, scoreBreakdown, signals }),
    markCompleted: (id, { completedAt, signals }) =>
      update(id, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: null,
        completedAt,
        ...(signals ? { signals } : {}),
      }),
    markFailed: (id, { errorMessage }) => update(id, { status: 'FAILED', errorMessage }),
  };
}

module.exports = { createAuditStore };
