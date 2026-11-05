/**
 * Every write the pipeline makes to the database.
 * @param {object} prisma
 */
function createAuditStore(prisma) {
  const update = (id, data) => prisma.audit.update({ where: { id }, data });
  return {
    load: (id) =>
      prisma.audit.findUnique({
        where: { id },
        include: {
          client: true,
          report: { select: { auditId: true } },
          notifications: { select: { channel: true } },
        },
      }),
    markRunning: (id) => update(id, { status: 'RUNNING', errorMessage: null, completedAt: null }),
    setStep: (id, { currentStep, progress }) => update(id, { currentStep, progress }),
    saveSignals: (id, signals) => update(id, { signals }),
    saveResult: (id, { result, overallScore, scoreBreakdown, signals }) =>
      update(id, { result, overallScore, scoreBreakdown, signals }),
    saveReport: async (id, { bytes, pdfPath }) => {
      await prisma.auditReport.upsert({
        where: { auditId: id },
        create: { auditId: id, bytes, sizeBytes: bytes.length },
        update: { bytes, sizeBytes: bytes.length },
      });
      await update(id, { pdfPath });
    },
    addNotification: (id, { channel, status, providerId }) =>
      prisma.notification.create({ data: { auditId: id, channel, status, providerId } }),
    markCompleted: (id, { completedAt, signals, note }) =>
      update(id, {
        status: 'COMPLETED',
        progress: 100,
        currentStep: null,
        completedAt,
        errorMessage: note || null,
        ...(signals ? { signals } : {}),
      }),
    markFailed: (id, { errorMessage }) => update(id, { status: 'FAILED', errorMessage }),
  };
}

module.exports = { createAuditStore };
