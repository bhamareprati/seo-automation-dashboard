import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { handleCronTick } = require('../../src/lib/handlers/cron.js');
const { message } = require('../../src/lib/messages.js');
const { cronTick } = require('../../src/pipeline/cronTick.js');
const { enqueueDueAudits, isDue, reconcileStuckAudits } = require('../../src/pipeline/schedule.js');

const SECRET = 'c'.repeat(32);
const env = { CRON_SECRET: SECRET };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const call = (authorization) =>
  new Request('https://app.example.test/api/cron/audits', {
    headers: authorization ? { authorization } : {},
  });

describe('GET /api/cron/audits', () => {
  it('cron rejects a missing or wrong secret', async () => {
    const runInBackground = vi.fn();
    for (const header of [undefined, 'Bearer wrong', SECRET, `Basic ${SECRET}`, 'Bearer ']) {
      const res = await handleCronTick(call(header), { env, runInBackground, tick: vi.fn() });
      expect(res.status).toBe(401);
    }
    expect(runInBackground).not.toHaveBeenCalled();
  });

  it('cron replies before running the job', async () => {
    let finishWork;
    const work = new Promise((resolve) => { finishWork = resolve; });
    let workDone = false;
    const tick = () => work.then(() => { workDone = true; });
    const runInBackground = vi.fn((task) => { task(); });

    const res = await handleCronTick(call(`Bearer ${SECRET}`), { env, runInBackground, tick });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: true });
    expect(runInBackground).toHaveBeenCalledOnce();
    expect(workDone).toBe(false);
    finishWork();
    await work;
  });
});

describe('cronTick', () => {
  const deps = (counts, claimed = false) => ({
    claimHourlyCheck: vi.fn(async () => claimed),
    runHourlyCheck: vi.fn(async () => {}),
    getCounts: vi.fn(async () => ({ waiting: 0, delayed: 0, active: 0, ...counts })),
    runStalledCheck: vi.fn(async () => {}),
    runJob: vi.fn(async () => ({ ran: true })),
  });

  it('idle tick does not touch Postgres', async () => {
    const d = deps({});
    expect(await cronTick(d)).toEqual({ ran: false });
    // The hourly check is the only part of a tick that can reach Postgres.
    expect(d.runHourlyCheck).not.toHaveBeenCalled();
    expect(d.runJob).not.toHaveBeenCalled();
    expect(d.runStalledCheck).not.toHaveBeenCalled();
  });

  it('runs the hourly check only when it wins the claim', async () => {
    const d = deps({}, true);
    await cronTick(d);
    expect(d.runHourlyCheck).toHaveBeenCalledOnce();
  });

  it('runs one job when work is waiting or due for retry', async () => {
    for (const counts of [{ waiting: 1 }, { delayed: 1 }, { waiting: 3, delayed: 2 }]) {
      const d = deps(counts);
      await cronTick(d);
      expect(d.runJob).toHaveBeenCalledOnce();
    }
  });

  it('checks for stalled jobs only when a job is active', async () => {
    const d = deps({ active: 1 });
    await cronTick(d);
    expect(d.runStalledCheck).toHaveBeenCalledOnce();
    expect(d.runJob).not.toHaveBeenCalled();
  });
});

describe('monthly schedule', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  it('due rule uses latest audit or creation date', () => {
    expect(isDue({ createdAt: daysAgo(31), audits: [] }, now, 30)).toBe(true);
    expect(isDue({ createdAt: daysAgo(29), audits: [] }, now, 30)).toBe(false);
    expect(isDue({ createdAt: daysAgo(90), audits: [{ createdAt: daysAgo(31) }] }, now, 30)).toBe(true);
    expect(isDue({ createdAt: daysAgo(90), audits: [{ createdAt: daysAgo(5) }] }, now, 30)).toBe(false);
  });

  function schedulePrisma() {
    const clients = [
      { id: 'due', createdAt: daysAgo(31), audits: [] },
      { id: 'recent', createdAt: daysAgo(90), audits: [{ createdAt: daysAgo(1) }] },
      { id: 'new', createdAt: daysAgo(2), audits: [] },
    ];
    return { client: { findMany: vi.fn(async () => clients) } };
  }

  it('monthly audit is enqueued once', async () => {
    const prisma = schedulePrisma();
    const active = new Set();
    // Behaves like the real one: a client with an active audit can't get a second.
    const createAuditIfIdle = vi.fn(async (_, clientId, triggeredBy) => {
      if (active.has(clientId)) return { created: false, auditId: `${clientId}-audit` };
      active.add(clientId);
      expect(triggeredBy).toBe('cron');
      return { created: true, auditId: `${clientId}-audit` };
    });
    const enqueue = vi.fn(async () => {});
    const deps = { prisma, createAuditIfIdle, enqueue, now, intervalDays: 30, logger };

    expect(await enqueueDueAudits(deps)).toEqual(['due-audit']);
    expect(await enqueueDueAudits(deps)).toEqual([]);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith('due-audit');
  });

  it('stuck audit becomes FAILED', async () => {
    const update = vi.fn(async () => ({}));
    const prisma = {
      audit: {
        findMany: vi.fn(async () => [
          { id: 'no-job', currentStep: 'Crawling website' },
          { id: 'job-failed', currentStep: null },
          { id: 'job-alive', currentStep: 'Analysing with Claude' },
        ]),
        update,
      },
    };
    const states = { 'no-job': null, 'job-failed': 'failed', 'job-alive': 'active' };
    const failed = await reconcileStuckAudits({ prisma, getJobState: async (id) => states[id], now, logger });

    expect(failed).toEqual(['no-job', 'job-failed']);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'no-job' },
      data: { status: 'FAILED', errorMessage: message('M-FAIL-GENERIC', { step: 'Crawling website' }) },
    });
    const cutoff = prisma.audit.findMany.mock.calls[0][0].where.createdAt.lt;
    expect(now.getTime() - cutoff.getTime()).toBe(20 * 60 * 1000);
  });
});
