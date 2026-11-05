const { ACTIVE_STATUSES } = require('../auditSteps');
const { getRequestSession, requireAuditAccess, requireRole, requireSameOrigin } = require('../auth');
const {
  ConflictError,
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

/**
 * POST /api/audit/[id]/retry. For a failed audit, or a finished one whose PDF is missing.
 * Steps that already succeeded are skipped, so this doesn't pay for Claude again.
 * @param {Request} request
 * @param {string} id
 * @param {{ env: object, prisma: object, enqueue: Function, startRunner: Function }} deps
 */
async function handleRetryAudit(request, id, { env, prisma, enqueue, startRunner }) {
  try {
    requireSameOrigin(request, env);
    requireRole(await getRequestSession(request, env), 'admin');

    const audit = await prisma.audit.findUnique({
      where: { id },
      select: { id: true, clientId: true, status: true, report: { select: { auditId: true } } },
    });
    if (!audit) throw new NotFoundError(message('M-NOT-FOUND'));

    const retryable = audit.status === 'FAILED' || (audit.status === 'COMPLETED' && !audit.report);
    if (!retryable) throw new ConflictError('This audit does not need a retry.');

    const other = await prisma.audit.findFirst({
      where: { clientId: audit.clientId, status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (other) {
      return Response.json({ error: message('M-AUDIT-ACTIVE'), code: 'CONFLICT', auditId: other.id }, { status: 409 });
    }

    await prisma.audit.update({ where: { id }, data: { status: 'QUEUED', errorMessage: null } });
    try {
      await enqueue(id);
    } catch {
      await prisma.audit.update({
        where: { id },
        data: { status: audit.status, errorMessage: message('M-QUEUE-DOWN') },
      });
      throw new QueueUnavailableError(message('M-QUEUE-DOWN'));
    }

    startRunner();
    return Response.json({ auditId: id }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Makes a safe download name. The client's name is display text and never reaches the file system. */
function reportFileName(clientName, createdAt) {
  const slug = String(clientName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client';
  return `seo-report-${slug}-${new Date(createdAt).toISOString().slice(0, 10)}.pdf`;
}

/**
 * GET /api/audit/[id]/report. Reads the stored copy, because /tmp is not shared on Vercel.
 * @param {Request} request
 * @param {string} id
 * @param {{ env: object, prisma: object }} deps
 */
async function handleGetReport(request, id, { env, prisma }) {
  try {
    const session = requireRole(await getRequestSession(request, env), 'admin', 'client');
    const audit = await prisma.audit.findUnique({
      where: { id },
      select: { clientId: true, createdAt: true, client: { select: { name: true } } },
    });
    if (!audit) throw new NotFoundError(message('M-NOT-FOUND'));
    requireAuditAccess(session, audit);

    const report = await prisma.auditReport.findUnique({ where: { auditId: id } });
    if (!report) throw new NotFoundError('This audit has no PDF yet.');

    return new Response(report.bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(report.sizeBytes),
        'Content-Disposition': `attachment; filename="${reportFileName(audit.client.name, audit.createdAt)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * GET /api/notifications. Admins see all, clients only their own.
 * @param {Request} request
 * @param {{ env: object, prisma: object }} deps
 */
async function handleListNotifications(request, { env, prisma }) {
  try {
    const session = requireRole(await getRequestSession(request, env), 'admin', 'client');
    const notifications = await prisma.notification.findMany({
      where: session.role === 'client' ? { audit: { clientId: session.clientId } } : {},
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        channel: true,
        status: true,
        providerId: true,
        createdAt: true,
        auditId: true,
        audit: { select: { client: { select: { name: true } } } },
      },
    });
    return Response.json({
      notifications: notifications.map(({ audit, ...n }) => ({ ...n, clientName: audit.client.name })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

module.exports = { handleCreateAudit, handleGetAudit, handleRetryAudit, handleGetReport, handleListNotifications, reportFileName };
