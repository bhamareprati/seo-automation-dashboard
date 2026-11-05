const { PdfError } = require('../lib/errors');

const RENDER_TIMEOUT_MS = 30000;

/**
 * Starts Chromium: installed Chrome in development, the serverless build in production.
 * Both packages are ESM, which Next.js only accepts through import().
 * @param {{ CHROME_EXECUTABLE_PATH?: string }} env
 */
async function launchBrowser(env) {
  const puppeteerModule = await import('puppeteer-core');
  const puppeteer = puppeteerModule.default || puppeteerModule;
  if (env.CHROME_EXECUTABLE_PATH) {
    return puppeteer.launch({ executablePath: env.CHROME_EXECUTABLE_PATH, headless: true });
  }
  const chromiumModule = await import('@sparticuz/chromium');
  const chromium = chromiumModule.default || chromiumModule;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}

/**
 * Turns report HTML into a PDF in a locked-down page. JavaScript is off and every outside request
 * is blocked, so a hostile page title can't run code or fetch file:// or internal addresses,
 * even if escaping ever failed.
 * @param {string} html
 * @param {{ launch: () => Promise<object>, footer?: string }} deps
 * @returns {Promise<Buffer>}
 */
async function renderPdf(html, { launch, footer }) {
  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url === 'about:blank' || url.startsWith('data:')) request.continue();
      else request.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(footer),
      headerTemplate: '<span></span>',
      footerTemplate: footer || '<span></span>',
      timeout: RENDER_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } catch (err) {
    throw new PdfError(`PDF rendering failed: ${err.name}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { launchBrowser, renderPdf };
