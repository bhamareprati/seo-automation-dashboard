const cheerio = require('cheerio');
const { safeFetch } = require('./safeFetch');

const MAX_SITEMAP_URLS = 50000; // The sitemap protocol's own limit for one file.

/**
 * Reads the parts of robots.txt that matter for an audit.
 * @param {string} text
 * @returns {{ blocksAllCrawlers: boolean, sitemaps: string[] }}
 */
function parseRobots(text) {
  const sitemaps = [];
  let blocksAllCrawlers = false;
  let agents = [];
  let inRules = false;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
    } else if (field === 'user-agent') {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
    } else if (field === 'disallow' || field === 'allow') {
      inRules = true;
      if (field === 'disallow' && value === '/' && agents.includes('*')) blocksAllCrawlers = true;
    }
  }
  return { blocksAllCrawlers, sitemaps };
}

/**
 * Reads a sitemap file. Cheerio tolerates broken XML, so validity is judged by the root element.
 * @param {string} xml
 * @returns {{ valid: boolean, kind: 'urlset'|'sitemapindex'|null, urlCount: number }}
 */
function parseSitemap(xml) {
  const text = String(xml).trim();
  if (!text.startsWith('<')) return { valid: false, kind: null, urlCount: 0 };
  const $ = cheerio.load(text, { xml: true });
  const kind = ['urlset', 'sitemapindex'].find((name) => $(name).length > 0) || null;
  if (!kind) return { valid: false, kind: null, urlCount: 0 };
  const entries = kind === 'urlset' ? $('url > loc') : $('sitemap > loc');
  return { valid: true, kind, urlCount: Math.min(entries.length, MAX_SITEMAP_URLS) };
}

const notFound = (reason) => ({ present: false, status: null, reason });

async function fetchText(url, { fetchPage, timeoutMs }) {
  try {
    const page = await fetchPage(url, { timeoutMs });
    return page.status === 200 ? { ok: true, status: 200, text: page.body } : { ok: false, status: page.status };
  } catch (err) {
    return { ok: false, status: null, reason: err.reason || err.code || err.name };
  }
}

/**
 * Step 6. A missing file is a finding for the report, never a failure of the audit.
 * @param {{ finalUrl: string, fixture?: object }} crawl
 * @param {{ fetchPage?: typeof safeFetch, timeoutMs?: number }} options
 */
async function checkRobotsAndSitemap(crawl, { fetchPage = safeFetch, timeoutMs } = {}) {
  const { origin } = new URL(crawl.finalUrl);

  const robotsFile = crawl.fixture
    ? { ok: true, status: 200, text: crawl.fixture.robotsTxt }
    : await fetchText(`${origin}/robots.txt`, { fetchPage, timeoutMs });
  const robotsInfo = robotsFile.ok ? parseRobots(robotsFile.text) : { blocksAllCrawlers: false, sitemaps: [] };
  const robots = robotsFile.ok
    ? { present: true, status: 200, ...robotsInfo }
    : { ...notFound(robotsFile.reason), status: robotsFile.status, blocksAllCrawlers: false, sitemaps: [] };

  const sitemapUrl = robotsInfo.sitemaps[0] || `${origin}/sitemap.xml`;
  const sitemapFile = crawl.fixture
    ? { ok: true, status: 200, text: crawl.fixture.sitemapXml }
    : await fetchText(sitemapUrl, { fetchPage, timeoutMs });
  const sitemap = sitemapFile.ok
    ? { present: true, url: sitemapUrl, listedInRobots: robotsInfo.sitemaps.length > 0, ...parseSitemap(sitemapFile.text) }
    : { present: false, url: sitemapUrl, listedInRobots: robotsInfo.sitemaps.length > 0, valid: false, kind: null, urlCount: 0 };

  return { robots, sitemap };
}

module.exports = { parseRobots, parseSitemap, checkRobotsAndSitemap };
