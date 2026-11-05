import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { deliverReport } = require('../../src/delivery/index.js');
const { AUDIT_STEPS } = require('../../src/lib/auditSteps.js');
const { signSession } = require('../../src/lib/auth.js');
const { handleGetReport, handleListNotifications, handleRetryAudit, reportFileName } = require('../../src/lib/handlers/audit.js');
const { message } = require('../../src/lib/messages.js');
const { flagForScore, flagForVital, parseDisplayValue, scoreStrip, vitalStrip, vitalsFromSignals } = require('../../src/lib/referenceRanges.js');
const sample = require('../../src/mocks/claude.mock.js');
const gsc = require('../../src/mocks/gsc.mock.js');
const pagespeed = require('../../src/mocks/pagespeed.mock.js');
const rankings = require('../../src/mocks/dataforseo.mock.js');
const { createReportSteps } = require('../../src/pipeline/reportSteps.js');
const { runAudit } = require('../../src/pipeline/runAudit.js');
const { isStepDone } = require('../../src/pipeline/steps.js');
const { launchBrowser, renderPdf } = require('../../src/reports/render.js');
const { footerTemplate, renderReportHtml } = require('../../src/reports/template.js');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const client = { id: 'c1', name: 'Example Dental Clinic', websiteUrl: 'https://example-dental-clinic.com', whatsapp: '+910000000001', email: 'client@demo.test' };
const signals = { cwv: pagespeed, gsc, rankings, meta: { usedMocks: true, aiSource: 'mock', crawlSource: 'fixture', warnings: [], stepMs: {} } };
const html = (overrides = {}) =>
  renderReportHtml({ client, result: sample, signals, createdAt: new Date('2026-11-05T10:00:00Z'), ...overrides });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const hasChrome = fs.existsSync(CHROME);

describe('reference ranges', () => {
  it('reference strip flags the mock vitals correctly', () => {
    const flags = Object.fromEntries(vitalsFromSignals(pagespeed).map((v) => [v.key, [v.strip.value, v.strip.flag]]));
    expect(flags).toEqual({ lcp: ['4.2 s', 'Poor'], inp: ['280 ms', 'Needs work'], cls: ['0.08', 'Good'] });
  });

  it('score bands and vital thresholds fall on the right side', () => {
    expect([100, 90, 89, 50, 49, 0].map(flagForScore)).toEqual(['Good', 'Good', 'Needs work', 'Needs work', 'Poor', 'Poor']);
    expect([2.5, 2.6, 4, 4.1].map((v) => flagForVital('lcp', v))).toEqual(['Good', 'Needs work', 'Needs work', 'Poor']);
    expect([200, 201, 500, 501].map((v) => flagForVital('inp', v))).toEqual(['Good', 'Needs work', 'Needs work', 'Poor']);
  });

  it('strips run in the right direction and stay in bounds', () => {
    expect(scoreStrip(58).segments.map((s) => s.flag)).toEqual(['Poor', 'Needs work', 'Good']);
    expect(scoreStrip(58).markerPercent).toBe(58);
    expect(vitalStrip('lcp', 4.2).segments.map((s) => s.flag)).toEqual(['Good', 'Needs work', 'Poor']);
    expect(vitalStrip('lcp', 99).markerPercent).toBe(100);
    const widths = vitalStrip('cls', 0.08).segments.reduce((sum, s) => sum + s.percent, 0);
    expect(widths).toBeCloseTo(100);
  });

  it('copes with the mock audit that has no displayValue', () => {
    expect(parseDisplayValue(undefined)).toBeNull();
    expect(parseDisplayValue('2 blocking resources')).toBe(2);
    expect(vitalsFromSignals({})).toEqual([]);
  });
});

describe('report template', () => {
  it('report escapes crawled text', () => {
    const attack = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'';
    const out = html({
      client: { ...client, name: attack, websiteUrl: `https://x.test/${attack}` },
      result: {
        ...sample,
        executive_summary: attack,
        critical_issues: [attack],
        quick_wins: [attack],
        important_issues: [attack],
        recommendations: [{ ...sample.recommendations[0], finding: attack, fix: attack, falsifiability_check: attack, category: attack }],
      },
    });
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(footerTemplate(attack)).not.toContain('<script>');
  });

  it('report contains the sample data notice', () => {
    const out = html();
    expect(out).toContain(message('M-SAMPLE-DATA').replace(/'/g, '&#39;'));
    expect(out).toContain(message('M-AI-SAMPLE'));
    const real = html({ signals: { ...signals, meta: { usedMocks: false, aiSource: 'claude', model: 'claude-sonnet-4-6' } } });
    expect(real).not.toContain('Some figures are sample data');
    expect(real).toContain('Analysed by Claude (claude-sonnet-4-6)');
  });

  it('shows the score sentence, checks and the correct ranking', () => {
    const out = html();
    expect(out).toContain('Your website scored 58 out of 100.');
    expect(out).toContain("How we'll know it worked:");
    for (const rec of sample.recommendations) expect(out).toContain(rec.falsifiability_check.replace(/"/g, '&quot;'));
    expect(out).toContain('ranks 4,');
    expect(out).toContain('1,900 searches');
    expect(out).toContain('4.2 s');
  });

  it('makes no outside requests', () => {
    expect(html()).not.toMatch(/(src|href)=|url\(|@import/);
  });
});

describe.runIf(hasChrome)('PDF renderer, with real Chrome', () => {
  const launch = () => launchBrowser({ CHROME_EXECUTABLE_PATH: CHROME });

  it('output starts with %PDF', async () => {
    const pdf = await renderPdf(html(), { launch, footer: footerTemplate(client.name) });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  }, 60000);

  it('renderer blocks network requests', async () => {
    const hits = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url);
      res.end('x');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const hostile = `<!doctype html><html><head>
      <link rel="stylesheet" href="http://127.0.0.1:${port}/style.css">
      <script src="http://127.0.0.1:${port}/script.js"></script>
    </head><body>
      <img src="http://127.0.0.1:${port}/image.png">
      <iframe src="http://127.0.0.1:${port}/frame"></iframe>
      <img src="file:///C:/Windows/win.ini">
      <script>fetch("http://127.0.0.1:${port}/fetched")</script>
      <p>Still renders</p>
    </body></html>`;
    try {
      const pdf = await renderPdf(hostile, { launch });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(hits).toEqual([]);
    } finally {
      server.close();
    }
  }, 60000);

  it('a browser that will not start raises PdfError', async () => {
    await expect(renderPdf('<p>x</p>', { launch: async () => { throw new Error('no chrome'); } })).rejects.toMatchObject({
      name: 'PdfError',
      messageId: 'M-PDF-MISSING',
    });
  });
});

describe('delivery', () => {
  const senders = () => ({
    whatsapp: vi.fn(async () => ({ status: 'mock_sent', sid: 'MOCK_SID_1' })),
    email: vi.fn(async () => ({ status: 'mock_sent', id: 'MOCK_EMAIL_1' })),
  });

  it('WhatsApp mock is called with the spec arguments', async () => {
    const s = senders();
    await deliverReport({ client, pdfPath: '/tmp/reports/a1.pdf', score: 58 }, { recordNotification: vi.fn(), senders: s, logger });
    expect(s.whatsapp).toHaveBeenCalledWith('c1', '/tmp/reports/a1.pdf', 58);
  });

  it('the real mock file keeps its output and result shape', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const recordNotification = vi.fn();
    await deliverReport({ client, pdfPath: '/tmp/reports/a1.pdf', score: 58 }, { recordNotification, senders: { whatsapp: require('../../src/mocks/twilio.mock.js').sendWhatsApp, email: require('../../src/mocks/email.mock.js').sendEmail }, logger });
    expect(log).toHaveBeenCalledWith('[MOCK WHATSAPP] → Score: ', '58/100');
    expect(recordNotification).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whatsapp', status: 'mock_sent', providerId: expect.stringMatching(/^MOCK_SID_/) }));
    log.mockRestore();
  });

  it('Notification rows are written', async () => {
    const recordNotification = vi.fn();
    const outcomes = await deliverReport({ client, pdfPath: 'p', score: 58 }, { recordNotification, senders: senders(), logger });
    expect(recordNotification).toHaveBeenCalledTimes(2);
    expect(outcomes).toEqual([
      { channel: 'whatsapp', status: 'mock_sent', providerId: 'MOCK_SID_1' },
      { channel: 'email', status: 'mock_sent', providerId: 'MOCK_EMAIL_1' },
    ]);
  });

  it('missing contact skips the channel', async () => {
    const s = senders();
    const recordNotification = vi.fn();
    await deliverReport({ client: { ...client, whatsapp: null }, pdfPath: 'p', score: 58 }, { recordNotification, senders: s, logger });
    expect(s.whatsapp).not.toHaveBeenCalled();
    expect(s.email).toHaveBeenCalledOnce();
    expect(recordNotification).toHaveBeenCalledOnce();
  });

  it('a retry does not send to a channel already recorded', async () => {
    const s = senders();
    await deliverReport({ client, pdfPath: 'p', score: 58, alreadySent: ['whatsapp'] }, { recordNotification: vi.fn(), senders: s, logger });
    expect(s.whatsapp).not.toHaveBeenCalled();
    expect(s.email).toHaveBeenCalledOnce();
  });
});

describe('report and delivery in the pipeline', () => {
  function setup(initial = {}, overrides = {}) {
    const audit = {
      id: 'a1',
      status: 'RUNNING',
      progress: 90,
      createdAt: new Date('2026-11-05T10:00:00Z'),
      client,
      signals: { ...signals, crawl: {}, technical: {}, onPage: {}, schema: {} },
      result: sample,
      notifications: [],
      report: null,
      ...initial,
    };
    const store = {
      load: vi.fn(async () => audit),
      markRunning: vi.fn(async () => {}),
      setStep: vi.fn(async (_, change) => Object.assign(audit, change)),
      saveReport: vi.fn(async (_, { pdfPath }) => { audit.pdfPath = pdfPath; audit.report = { auditId: 'a1' }; }),
      addNotification: vi.fn(async (_, n) => audit.notifications.push(n)),
      markCompleted: vi.fn(async (_, change) => { audit.status = 'COMPLETED'; audit.errorMessage = change.note || null; }),
    };
    const render = vi.fn(async () => Buffer.from('%PDF-1.4 test'));
    const storeFile = vi.fn(async () => '/tmp/reports/a1.pdf');
    const deliver = vi.fn(async () => []);
    const reportSteps = createReportSteps({ store, launchBrowser: vi.fn(), reportsDir: 'x', logger, render, storeFile, deliver, ...overrides });
    const steps = Object.fromEntries(AUDIT_STEPS.map(({ key }) => [key, vi.fn(async () => {})]));
    Object.assign(steps, reportSteps);
    return { audit, store, steps, render, deliver };
  }

  it('saves the report, sets pdfPath and then delivers', async () => {
    const { audit, store, steps, deliver } = setup();
    await runAudit('a1', { store, steps, isStepDone, logger });
    expect(audit.pdfPath).toBe('/tmp/reports/a1.pdf');
    expect(store.saveReport).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver.mock.calls[0][0]).toMatchObject({ pdfPath: '/tmp/reports/a1.pdf', score: 58 });
    expect(audit.status).toBe('COMPLETED');
    expect(audit.errorMessage).toBeNull();
  });

  it('retry after PDF does not repeat earlier steps', async () => {
    const { store, steps } = setup({ status: 'COMPLETED', pdfPath: null, errorMessage: message('M-PDF-MISSING') });
    await runAudit('a1', { store, steps, isStepDone, logger });
    const labels = store.setStep.mock.calls.map((c) => c[1].currentStep);
    expect(labels).toEqual(['Generating PDF report', 'Sending notifications']);
    for (const key of ['crawl', 'pagespeed', 'gsc', 'schema', 'onPage', 'robots', 'rankings']) {
      expect(steps[key], key).not.toHaveBeenCalled();
    }
  });

  it('a finished audit with its PDF is not run again', async () => {
    const { store, steps, render } = setup({ status: 'COMPLETED', report: { auditId: 'a1' } });
    const out = await runAudit('a1', { store, steps, isStepDone, logger });
    expect(out.skipped).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });

  it('PDF failure leaves the audit COMPLETED', async () => {
    const render = vi.fn(async () => { throw new Error('chrome crashed'); });
    const { audit, store, steps, deliver } = setup({}, { render });
    await runAudit('a1', { store, steps, isStepDone, logger });
    expect(audit.status).toBe('COMPLETED');
    expect(audit.errorMessage).toBe(message('M-PDF-MISSING'));
    expect(store.saveReport).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('delivery failure leaves the audit COMPLETED', async () => {
    const failing = (args, deps) =>
      deliverReport(args, {
        ...deps,
        senders: {
          whatsapp: async () => { throw new Error('twilio down'); },
          email: async () => ({ status: 'mock_sent', id: 'E1' }),
        },
      });
    const { audit, store, steps } = setup({}, { deliver: failing });
    await runAudit('a1', { store, steps, isStepDone, logger });
    expect(audit.status).toBe('COMPLETED');
    expect(audit.errorMessage).toBeNull();
    expect(audit.notifications).toEqual([
      { channel: 'whatsapp', status: 'failed', providerId: null },
      { channel: 'email', status: 'mock_sent', providerId: 'E1' },
    ]);
  });
});

describe('report, retry and notification routes', () => {
  const env = { SESSION_SECRET: 's'.repeat(32), APP_URL: 'https://app.example.test' };
  const cookie = async (session) => `seo_session=${await signSession(session, env.SESSION_SECRET)}`;
  const auditRow = { clientId: 'c1', createdAt: new Date('2026-11-05T10:00:00Z'), client: { name: 'Example / Dental "Clinic"' } };
  const reportPrisma = (report = { bytes: Buffer.from('%PDF-1.4 x'), sizeBytes: 10 }) => ({
    audit: { findUnique: vi.fn(async () => auditRow) },
    auditReport: { findUnique: vi.fn(async () => report) },
  });
  const getReport = async (session) =>
    new Request('https://app.example.test/api/audit/a1/report', { headers: session ? { cookie: await cookie(session) } : {} });

  it('the owning client and an admin can download the PDF', async () => {
    for (const session of [{ role: 'admin' }, { role: 'client', clientId: 'c1' }]) {
      const res = await handleGetReport(await getReport(session), 'a1', { env, prisma: reportPrisma() });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="seo-report-example-dental-clinic-2026-11-05.pdf"');
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  it("client cannot read another client's report", async () => {
    const prisma = reportPrisma();
    const res = await handleGetReport(await getReport({ role: 'client', clientId: 'c2' }), 'a1', { env, prisma });
    expect(res.status).toBe(403);
    expect(prisma.auditReport.findUnique).not.toHaveBeenCalled();
  });

  it('a signed-out caller and a missing report get clear errors', async () => {
    expect((await handleGetReport(await getReport(null), 'a1', { env, prisma: reportPrisma() })).status).toBe(401);
    const none = await handleGetReport(await getReport({ role: 'admin' }), 'a1', { env, prisma: reportPrisma(null) });
    expect(none.status).toBe(404);
  });

  it('a file name never carries unsafe characters', () => {
    expect(reportFileName('../../etc/passwd', '2026-11-05')).toBe('seo-report-etc-passwd-2026-11-05.pdf');
    expect(reportFileName('क्लिनिक', '2026-11-05')).toBe('seo-report-client-2026-11-05.pdf');
  });

  const retry = async (session, headers = {}) =>
    new Request('https://app.example.test/api/audit/a1/retry', {
      method: 'POST',
      headers: { ...(session ? { cookie: await cookie(session) } : {}), ...headers },
    });
  const retryDeps = (audit, other = null) => ({
    env,
    enqueue: vi.fn(async () => {}),
    startRunner: vi.fn(),
    prisma: {
      audit: {
        findUnique: vi.fn(async () => audit),
        findFirst: vi.fn(async () => other),
        update: vi.fn(async () => ({})),
      },
    },
  });

  it('retry requeues a failed audit or a finished one with no PDF', async () => {
    for (const audit of [{ id: 'a1', clientId: 'c1', status: 'FAILED', report: null }, { id: 'a1', clientId: 'c1', status: 'COMPLETED', report: null }]) {
      const deps = retryDeps(audit);
      const res = await handleRetryAudit(await retry({ role: 'admin' }), 'a1', deps);
      expect(res.status).toBe(202);
      expect(deps.prisma.audit.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'QUEUED', errorMessage: null } });
      expect(deps.enqueue).toHaveBeenCalledWith('a1');
      expect(deps.startRunner).toHaveBeenCalledOnce();
    }
  });

  it('retry is refused for a finished audit, a running one, or a non-admin', async () => {
    const done = retryDeps({ id: 'a1', clientId: 'c1', status: 'COMPLETED', report: { auditId: 'a1' } });
    expect((await handleRetryAudit(await retry({ role: 'admin' }), 'a1', done)).status).toBe(409);
    const running = retryDeps({ id: 'a1', clientId: 'c1', status: 'RUNNING', report: null });
    expect((await handleRetryAudit(await retry({ role: 'admin' }), 'a1', running)).status).toBe(409);
    const busy = retryDeps({ id: 'a1', clientId: 'c1', status: 'FAILED', report: null }, { id: 'other' });
    expect((await handleRetryAudit(await retry({ role: 'admin' }), 'a1', busy)).status).toBe(409);
    const client2 = retryDeps({ id: 'a1', clientId: 'c1', status: 'FAILED', report: null });
    expect((await handleRetryAudit(await retry({ role: 'client', clientId: 'c1' }), 'a1', client2)).status).toBe(403);
    expect(client2.enqueue).not.toHaveBeenCalled();
    const foreign = retryDeps({ id: 'a1', clientId: 'c1', status: 'FAILED', report: null });
    expect((await handleRetryAudit(await retry({ role: 'admin' }, { origin: 'https://evil.example.test' }), 'a1', foreign)).status).toBe(403);
  });

  it('notifications are limited to the client who owns them', async () => {
    const findMany = vi.fn(async () => [{ id: 'n1', channel: 'email', status: 'mock_sent', providerId: 'E', createdAt: new Date(), auditId: 'a1', audit: { client: { name: 'A' } } }]);
    const prisma = { notification: { findMany } };
    const request = async (session) => new Request('https://app.example.test/api/notifications', { headers: { cookie: await cookie(session) } });

    const res = await handleListNotifications(await request({ role: 'client', clientId: 'c1' }), { env, prisma });
    expect(findMany.mock.calls[0][0].where).toEqual({ audit: { clientId: 'c1' } });
    expect((await res.json()).notifications[0].clientName).toBe('A');

    await handleListNotifications(await request({ role: 'admin' }), { env, prisma });
    expect(findMany.mock.calls[1][0].where).toEqual({});

    const anon = await handleListNotifications(new Request('https://app.example.test/api/notifications'), { env, prisma });
    expect(anon.status).toBe(401);
  });
});
