const { deliverReport } = require('../delivery');
const { message } = require('../lib/messages');
const { footerTemplate, renderReportHtml } = require('../reports/template');
const { renderPdf } = require('../reports/render');
const { storeReportFile } = require('../reports/storage');

/**
 * Step 10 (PDF) and step 11 (delivery).
 * A PDF failure keeps the analysis: the audit still completes, with a message and a way to try again.
 * @param {{ store: object, launchBrowser: Function, reportsDir: string, logger: object, render?: Function, storeFile?: Function, deliver?: Function }} options
 */
function createReportSteps({
  store,
  launchBrowser,
  reportsDir,
  logger,
  render = renderPdf,
  storeFile = storeReportFile,
  deliver = deliverReport,
}) {
  const latestResult = (context) => context.analysis?.result || context.audit.result;

  return {
    pdf: async (context) => {
      const { audit } = context;
      try {
        const html = renderReportHtml({
          client: audit.client,
          result: latestResult(context),
          signals: context.signals,
          createdAt: audit.createdAt,
        });
        const bytes = await render(html, { launch: launchBrowser, footer: footerTemplate(audit.client.name) });
        const pdfPath = await storeFile(audit.id, bytes, { reportsDir });
        await store.saveReport(audit.id, { bytes, pdfPath });
        context.pdfPath = pdfPath;
      } catch (err) {
        logger.error('pdf_failed', { auditId: audit.id, code: err?.code || err?.name });
        context.completionNote = message('M-PDF-MISSING');
      }
    },
    delivery: async (context) => {
      const { audit } = context;
      const pdfPath = context.pdfPath || audit.pdfPath;
      // Nothing to deliver yet. Generating the PDF later runs this step again.
      if (!pdfPath) return;
      await deliver(
        {
          client: audit.client,
          pdfPath,
          score: latestResult(context).overall_score,
          alreadySent: (audit.notifications || []).map((n) => n.channel),
        },
        { recordNotification: (outcome) => store.addNotification(audit.id, outcome), logger },
      );
    },
  };
}

module.exports = { createReportSteps };
