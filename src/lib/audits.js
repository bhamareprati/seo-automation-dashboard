const { ACTIVE_STATUSES, WAITING_LABEL } = require('./auditSteps');
const { withDbRetry } = require('./dbRetry');

/**
 * Creates a QUEUED audit unless the client already has an active one.
 * The advisory lock makes this safe against two clicks arriving at the same moment,
 * without adding anything to the spec's schema.
 * @returns {Promise<{ created: boolean, auditId: string }>}
 */
async function createAuditIfIdle(prisma, clientId, triggeredBy = 'manual') {
  return withDbRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientId}))`;
        const active = await tx.audit.findFirst({
          where: { clientId, status: { in: ACTIVE_STATUSES } },
          select: { id: true },
        });
        if (active) return { created: false, auditId: active.id };
        const audit = await tx.audit.create({
          data: { clientId, triggeredBy, currentStep: WAITING_LABEL },
          select: { id: true },
        });
        return { created: true, auditId: audit.id };
      },
      { maxWait: 10000, timeout: 10000 },
    ),
  );
}

module.exports = { createAuditIfIdle };
