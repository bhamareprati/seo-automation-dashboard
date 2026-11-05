const { CrawlError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const { getCrawlFixture } = require('../mocks/crawl.mock');
const { safeFetch } = require('./safeFetch');

const isHtml = (headers) => /html|xml/i.test(String(headers['content-type'] || 'text/html'));

/**
 * Step 1. Fetches the homepage, from the sample fixture for listed hostnames under USE_MOCKS,
 * otherwise from the real site. The HTML stays in memory for later steps and is never stored.
 * @param {string} websiteUrl
 * @param {{ fetchPage?: typeof safeFetch, timeoutMs?: number }} options
 */
async function crawlSite(websiteUrl, { fetchPage = safeFetch, timeoutMs } = {}) {
  const target = new URL(websiteUrl);

  if (USE_MOCKS) {
    const fixture = getCrawlFixture(target.hostname);
    if (fixture) {
      return {
        source: 'fixture',
        url: target.href,
        finalUrl: target.href,
        status: fixture.status,
        html: fixture.html,
        responseMs: fixture.responseMs,
        htmlBytes: Buffer.byteLength(fixture.html),
        contentEncoding: fixture.contentEncoding,
        redirects: 0,
        truncated: false,
        fixture,
      };
    }
  }

  let page;
  try {
    page = await fetchPage(target.href, { timeoutMs });
  } catch (err) {
    throw new CrawlError(`Homepage fetch failed: ${err.reason || err.code || err.name}`);
  }
  if (page.status >= 400 || !isHtml(page.headers)) {
    throw new CrawlError(`Homepage returned status ${page.status}`);
  }

  return {
    source: 'live',
    url: target.href,
    finalUrl: page.url,
    status: page.status,
    html: page.body,
    responseMs: page.ms,
    htmlBytes: page.bytes,
    contentEncoding: page.headers['content-encoding'] || null,
    redirects: page.redirects,
    truncated: page.truncated,
  };
}

module.exports = { crawlSite };
