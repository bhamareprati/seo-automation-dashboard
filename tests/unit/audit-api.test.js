import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { signSession } = require('../../src/lib/auth.js');
const { handleCreateAudit, handleGetAudit } = require('../../src/lib/handlers/audit.js');
const { message } = require('../../src/lib/messages.js');

const env = { SESSION_SECRET: 's'.repeat(32), APP_URL: 'https://app.example.test', useMocks: true };
const adminCookie = async () => `seo_session=${await signSession({ role: 'admin' }, env.SESSION_SECRET)}`;
const clientCookie = async (clientId) =>
  `seo_session=${await signSession({ role: 'client', clientId }, env.SESSION_SECRET)}`;

const postAudit = (body, cookie, headers = {}) =>
  new Request('https://app.example.test/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });

const getAudit = (cookie) =>
  new Request('https://app.example.test/api/audit/a1', { headers: cookie ? { cookie } : {} });

describe('POST /api/audit', () => {
  let deps;

  beforeEach(() => {
    deps = {
      env,
      prisma: {
        client: { findUnique: vi.fn(async ({ where }) => (where.id === 'c1' ? { id: 'c1' } : null)) },
        audit: { update: vi.fn(async () => ({})) },
      },
      createAuditIfIdle: vi.fn(async () => ({ created: true, auditId: 'a1' })),
      enqueue: vi.fn(async () => {}),
      startRunner: vi.fn(),
    };
  });

  it('POST audit returns 202 and auditId', async () => {
    const res = await handleCreateAudit(postAudit({ clientId: 'c1' }, await adminCookie()), deps);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ auditId: 'a1' });
    expect(deps.enqueue).toHaveBeenCalledWith('a1');
    expect(deps.startRunner).toHaveBeenCalledOnce();
  });

  it('POST audit without clientId returns 400', async () => {
    const res = await handleCreateAudit(postAudit({}, await adminCookie()), deps);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('clientId required');
    expect(deps.createAuditIfIdle).not.toHaveBeenCalled();
  });

  it('unknown client returns 404', async () => {
    const res = await handleCreateAudit(postAudit({ clientId: 'nope' }, await adminCookie()), deps);
    expect(res.status).toBe(404);
    expect(deps.createAuditIfIdle).not.toHaveBeenCalled();
  });

  it('second audit returns 409', async () => {
    deps.createAuditIfIdle.mockResolvedValue({ created: false, auditId: 'existing' });
    const res = await handleCreateAudit(postAudit({ clientId: 'c1' }, await adminCookie()), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: message('M-AUDIT-ACTIVE'), code: 'CONFLICT', auditId: 'existing' });
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(deps.startRunner).not.toHaveBeenCalled();
  });

  it('queue failure returns 503 and marks the audit FAILED', async () => {
    deps.enqueue.mockRejectedValue(new Error('redis down'));
    const res = await handleCreateAudit(postAudit({ clientId: 'c1' }, await adminCookie()), deps);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('QUEUE_UNAVAILABLE');
    expect(deps.prisma.audit.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'FAILED', errorMessage: message('M-QUEUE-DOWN') },
    });
    expect(deps.startRunner).not.toHaveBeenCalled();
  });

  it('client cannot trigger an audit', async () => {
    const res = await handleCreateAudit(postAudit({ clientId: 'c1' }, await clientCookie('c1')), deps);
    expect(res.status).toBe(403);
    expect(deps.createAuditIfIdle).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller and a foreign Origin', async () => {
    expect((await handleCreateAudit(postAudit({ clientId: 'c1' }), deps)).status).toBe(401);
    const foreign = postAudit({ clientId: 'c1' }, await adminCookie(), { origin: 'https://evil.example.test' });
    expect((await handleCreateAudit(foreign, deps)).status).toBe(403);
    expect(deps.createAuditIfIdle).not.toHaveBeenCalled();
  });
});

describe('GET /api/audit/[id]', () => {
  const row = {
    id: 'a1',
    clientId: 'c1',
    status: 'RUNNING',
    progress: 62,
    currentStep: 'Fetching keyword rankings',
    overallScore: null,
    result: null,
    triggeredBy: 'manual',
    createdAt: new Date('2026-11-05T10:00:00Z'),
    completedAt: null,
    errorMessage: 'internal detail',
    report: null,
  };
  const prismaWith = (audit, signals = null) => ({
    audit: {
      findUnique: vi.fn(async ({ select }) => (select.signals ? { signals } : audit)),
    },
  });

  it('GET audit returns the spec fields', async () => {
    const prisma = prismaWith(row);
    const res = await handleGetAudit(getAudit(await adminCookie()), 'a1', { env, prisma });
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const field of ['status', 'progress', 'currentStep', 'overallScore', 'result']) {
      expect(body).toHaveProperty(field);
    }
    expect(body.progress).toBe(62);
    expect(body.hasReport).toBe(false);
    expect(body.dataMode.usedMocks).toBe(true);
    expect(body).not.toHaveProperty('signals');
  });

  it('does not read signals while an audit is active', async () => {
    const prisma = prismaWith(row);
    await handleGetAudit(getAudit(await adminCookie()), 'a1', { env, prisma });
    expect(prisma.audit.findUnique).toHaveBeenCalledOnce();
  });

  it('reads the data source once an audit has finished', async () => {
    const prisma = prismaWith({ ...row, status: 'COMPLETED' }, { meta: { usedMocks: true, aiSource: 'claude' } });
    const res = await handleGetAudit(getAudit(await adminCookie()), 'a1', { env, prisma });
    expect((await res.json()).dataMode.aiSource).toBe('claude');
  });

  it("client cannot read another client's audit", async () => {
    const res = await handleGetAudit(getAudit(await clientCookie('c2')), 'a1', { env, prisma: prismaWith(row) });
    expect(res.status).toBe(403);
  });

  it('a client reads their own audit, without internal error details', async () => {
    const res = await handleGetAudit(getAudit(await clientCookie('c1')), 'a1', { env, prisma: prismaWith(row) });
    expect(res.status).toBe(200);
    expect((await res.json()).errorMessage).toBeNull();
  });

  it('returns 401 when signed out and 404 for an unknown audit', async () => {
    expect((await handleGetAudit(getAudit(), 'a1', { env, prisma: prismaWith(row) })).status).toBe(401);
    expect((await handleGetAudit(getAudit(await adminCookie()), 'x', { env, prisma: prismaWith(null) })).status).toBe(404);
  });
});
