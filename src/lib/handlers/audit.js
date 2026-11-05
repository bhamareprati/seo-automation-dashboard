const { ACTIVE_STATUSES } = require('../auditSteps');
const { getRequestSession, requireAuditAccess, requireRole, requireSameOrigin } = require('../auth');
const {
  NotFoundError,
  QueueUnavailableError,
  ValidationError,
  toErrorResponse,
} = require('../errors');
const { message } = require('../messages');

function errorResponse(err) {
  const { status, body } = toErrorResponse(err);
  return Response.json(body, { status });
}

/**
 * POST /api/audit. Only enqueues: the audit itself runs in the background.
 * @param {Request} request
 * @param {{ env: object, prisma: object, createAuditIfIdle: Function, enqueue: Function, startRunner: Function }} deps
 */
async function handleCreateAudit(request, deps) {
  const { env, prisma, createAuditIfIdle, enqueue, startRunner } = deps;
  try {
    requireSameOrigin(request, env);
    requireRole(await getRequestSession(request, env), 'admin');

    const body = await request.json().catch(() => null);
    const clientId = body?.clientId;
    if (!clientId || typeof clientId !== 'string') throw new ValidationError('clientId required');

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundError('Client not found.');

    const { created, auditId } = await createAuditIfIdle(prisma, clientId);
    if (!created) {
      return Response.json({ error: message('M-AUDIT-ACTIVE'), code: 'CONFLICT', auditId }, { status: 409 });
    }

    try {
      await enqueue(auditId);
    } catch {
      // Without a job nothing would ever pick this row up, so it must not stay QUEUED.
      await prisma.audit.update({
        where: { id: auditId },
        data: { status: 'FAILED', errorMessage: message('M-QUEUE-DOWN') },
      });
      throw new QueueUnavailableError(message('M-QUEUE-DOWN'));
    }

    startRunner();
    return Response.json({ auditId }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

const TERMINAL_SELECT = {
  id: true,
  clientId: true,
  status: true,
  progress: true,
  currentStep: true,
  overallScore: true,
  result: true,
  triggeredBy: true,
  createdAt: true,
  completedAt: true,
  errorMessage: true,
  report: { select: { auditId: true } },
};

/**
 * GET /api/audit/[id]. Polled every 2 seconds while an audit runs, so `signals` is only read once it ends.
 * @param {Request} request
 * @param {string} id
 * @param {{ env: object, prisma: object }} deps
 */
async function handleGetAudit(request, id, { env, prisma }) {
  try {
    const session = requireRole(await getRequestSession(request, env), 'admin', 'client');
    const audit = await prisma.audit.findUnique({ where: { id }, select: TERMINAL_SELECT });
    if (!audit) throw new NotFoundError(message('M-NOT-FOUND'));
    requireAuditAccess(session, audit);

    let meta = null;
    if (!ACTIVE_STATUSES.includes(audit.status)) {
      const row = await prisma.audit.findUnique({ where: { id }, select: { signals: true } });
      meta = row?.signals?.meta || null;
    }

    return Response.json({
      status: audit.status,
      progress: audit.progress,
      currentStep: audit.currentStep,
      overallScore: audit.overallScore,
      result: audit.result,
      id: audit.id,
      clientId: audit.clientId,
      triggeredBy: audit.triggeredBy,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt,
      // Internal failure details are for the agency only.
      errorMessage: session.role === 'admin' ? audit.errorMessage : null,
      dataMode: {
        usedMocks: meta ? meta.usedMocks : env.useMocks,
        aiSource: meta?.aiSource || null,
      },
      hasReport: Boolean(audit.report),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

module.exports = { handleCreateAudit, handleGetAudit };
