import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { handleCronTick } = require('../../src/lib/handlers/cron.js');
const { cronTick } = require('../../src/pipeline/cronTick.js');

const SECRET = 'c'.repeat(32);
const env = { CRON_SECRET: SECRET };
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
  it('does nothing when the queue is empty', async () => {
    const runJob = vi.fn();
    const result = await cronTick({ getCounts: async () => ({ waiting: 0, delayed: 0 }), runJob });
    expect(result).toEqual({ ran: false });
    expect(runJob).not.toHaveBeenCalled();
  });

  it('runs one job when work is waiting or due for retry', async () => {
    const runJob = vi.fn(async () => ({ ran: true }));
    await cronTick({ getCounts: async () => ({ waiting: 1, delayed: 0 }), runJob });
    await cronTick({ getCounts: async () => ({ waiting: 0, delayed: 1 }), runJob });
    expect(runJob).toHaveBeenCalledTimes(2);
  });
});
