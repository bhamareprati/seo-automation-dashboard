import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AUDIT_STEPS, stepDisplayLabel } = require('../../src/lib/auditSteps.js');
const { CrawlError } = require('../../src/lib/errors.js');
const { message } = require('../../src/lib/messages.js');
const { runAudit } = require('../../src/pipeline/runAudit.js');
const { failureMessage, processAuditJob, runNextJob } = require('../../src/pipeline/runNextJob.js');
const { createSteps } = require('../../src/pipeline/steps.js');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function fakeStore(initial = {}) {
  const audit = { id: 'a1', status: 'QUEUED', progress: 0, client: { websiteUrl: 'https://x.test' }, ...initial };
  const history = [];
  return {
    audit,
    history,
    load: vi.fn(async () => audit),
    markRunning: vi.fn(async () => { audit.status = 'RUNNING'; }),
    setStep: vi.fn(async (_, change) => { history.push(change); Object.assign(audit, change); }),
    markCompleted: vi.fn(async () => { audit.status = 'COMPLETED'; audit.progress = 100; }),
    markFailed: vi.fn(async (_, change) => { audit.status = 'FAILED'; Object.assign(audit, change); }),
  };
}

const recordingSteps = (order) =>
  Object.fromEntries(AUDIT_STEPS.map(({ key }) => [key, async () => { order.push(key); }]));

describe('runAudit', () => {
  it('steps run in the spec order', async () => {
    const order = [];
    await runAudit('a1', { store: fakeStore(), steps: recordingSteps(order), logger });
    expect(order).toEqual([
      'crawl', 'pagespeed', 'gsc', 'schema', 'onPage', 'robots', 'rankings', 'analysis', 'save', 'pdf', 'delivery',
    ]);
  });

  it('step labels and progress stay as agreed', () => {
    expect(AUDIT_STEPS.map(({ label, progress }) => [label, progress])).toEqual([
      ['Crawling website', 15],
      ['Fetching PageSpeed data', 25],
      ['Fetching Search Console data', 32],
      ['Validating Schema.org markup', 40],
      ['Analysing on-page SEO', 48],
      ['Checking robots.txt and sitemap', 55],
      ['Fetching keyword rankings', 62],
      ['Analysing with Claude', 85],
      ['Saving audit results', 90],
      ['Generating PDF report', 96],
      ['Sending notifications', 100],
    ]);
  });

  it('progress only increases and ends at 100', async () => {
    const store = fakeStore();
    await runAudit('a1', { store, steps: recordingSteps([]), logger });
    const values = store.history.map((h) => h.progress);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(store.audit.progress).toBe(100);
    expect(store.audit.status).toBe('COMPLETED');
  });

  it('progress does not go backwards on a retry', async () => {
    const store = fakeStore({ status: 'RUNNING', progress: 62 });
    await runAudit('a1', { store, steps: recordingSteps([]), logger });
    expect(Math.min(...store.history.map((h) => h.progress))).toBe(62);
  });

  it('a completed audit is not run again', async () => {
    const order = [];
    const result = await runAudit('a1', { store: fakeStore({ status: 'COMPLETED' }), steps: recordingSteps(order), logger });
    expect(result.skipped).toBe(true);
    expect(order).toEqual([]);
  });

  it('a failing step stops the run and is not marked complete', async () => {
    const order = [];
    const steps = recordingSteps(order);
    steps.gsc = async () => { throw new Error('boom'); };
    const store = fakeStore();
    await expect(runAudit('a1', { store, steps, logger })).rejects.toThrow('boom');
    expect(order).toEqual(['crawl', 'pagespeed']);
    expect(store.markCompleted).not.toHaveBeenCalled();
  });

  it('every step has an implementation', () => {
    const sleep = vi.fn(async () => {});
    const steps = createSteps({ store: {}, env: {}, usedMocks: true, delayMs: 5, timeoutMs: 100, sleep });
    expect(Object.keys(steps).sort()).toEqual(AUDIT_STEPS.map((s) => s.key).sort());
  });
});

describe('step names shown in the portal', () => {
  const analysis = AUDIT_STEPS.find((s) => s.key === 'analysis');
  const crawl = AUDIT_STEPS.find((s) => s.key === 'crawl');

  it('never says Claude for a sample analysis, while running or afterwards', () => {
    expect(stepDisplayLabel(analysis, { aiSource: null, usesSampleAnalysis: true })).toBe('Preparing sample analysis');
    expect(stepDisplayLabel(analysis, { aiSource: 'mock', usesSampleAnalysis: false })).toBe('Preparing sample analysis');
  });

  it('says Claude when Claude is used, and what the saved audit used wins', () => {
    expect(stepDisplayLabel(analysis, { aiSource: null, usesSampleAnalysis: false })).toBe('Analysing with Claude');
    expect(stepDisplayLabel(analysis, { aiSource: 'claude', usesSampleAnalysis: true })).toBe('Analysing with Claude');
  });

  it('leaves other steps alone', () => {
    expect(stepDisplayLabel(crawl, { aiSource: 'mock', usesSampleAnalysis: true })).toBe('Crawling website');
  });
});

describe('job failure handling', () => {
  const job = (attemptsMade) => ({ data: { auditId: 'a1' }, attemptsMade, opts: { attempts: 2 } });

  it('a first failure leaves the audit for the retry', async () => {
    const store = fakeStore();
    const fail = async () => { throw new Error('boom'); };
    await expect(processAuditJob(job(0), { runAudit: fail, store, logger })).rejects.toThrow('boom');
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('the last failure marks the audit FAILED with a readable message', async () => {
    const store = fakeStore({ currentStep: 'Crawling website' });
    const fail = async () => { throw new Error('boom'); };
    await expect(processAuditJob(job(1), { runAudit: fail, store, logger })).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(store.audit.status).toBe('FAILED');
    expect(store.audit.errorMessage).toBe(message('M-FAIL-GENERIC', { step: 'Crawling website' }));
  });

  it('a crawl failure names the website', () => {
    const text = failureMessage(new CrawlError('down'), { client: { websiteUrl: 'https://x.test' } });
    expect(text).toBe(message('M-FAIL-CRAWL', { url: 'https://x.test' }));
  });
});

describe('runNextJob', () => {
  const fakeWorker = (job) => ({ getNextJob: vi.fn(async () => job), close: vi.fn(async () => {}) });
  const fakeJob = () => ({
    data: { auditId: 'a1' },
    moveToCompleted: vi.fn(async () => {}),
    moveToFailed: vi.fn(async () => {}),
  });
  const options = (worker, process) => ({ queueName: 'q', createWorker: () => worker, process, logger });

  it('runner completes or fails a job', async () => {
    const good = fakeJob();
    const okWorker = fakeWorker(good);
    expect(await runNextJob(options(okWorker, async () => {}))).toEqual({ ran: true, auditId: 'a1', ok: true });
    expect(good.moveToCompleted).toHaveBeenCalledOnce();
    expect(good.moveToFailed).not.toHaveBeenCalled();
    expect(okWorker.close).toHaveBeenCalledOnce();

    const bad = fakeJob();
    const failWorker = fakeWorker(bad);
    const failing = async () => { throw new Error('boom'); };
    expect(await runNextJob(options(failWorker, failing))).toEqual({ ran: true, auditId: 'a1', ok: false });
    expect(bad.moveToFailed).toHaveBeenCalledOnce();
    expect(bad.moveToCompleted).not.toHaveBeenCalled();
    expect(failWorker.close).toHaveBeenCalledOnce();
  });

  it('an empty queue does nothing and still closes the worker', async () => {
    const worker = fakeWorker(undefined);
    const process = vi.fn();
    expect(await runNextJob(options(worker, process))).toEqual({ ran: false });
    expect(process).not.toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledOnce();
  });

  it('holds the lock for longer than the function limit', async () => {
    const createWorker = vi.fn(() => fakeWorker(undefined));
    await runNextJob({ queueName: 'q', createWorker, process: vi.fn(), logger });
    expect(createWorker.mock.calls[0][1].lockDuration).toBeGreaterThan(300000);
  });
});
