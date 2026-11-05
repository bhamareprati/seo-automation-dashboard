/**
 * Combines the crawl and the robots and sitemap check into the prompt's technical section.
 * Holds no page content.
 * @param {object} crawl from crawlSite
 * @param {{ robots: object, sitemap: object }} files from checkRobotsAndSitemap
 */
function buildTechnical(crawl, { robots, sitemap }) {
  return {
    https: crawl.finalUrl.startsWith('https://'),
    finalUrl: crawl.finalUrl,
    status: crawl.status,
    redirects: crawl.redirects,
    responseMs: crawl.responseMs,
    htmlBytes: crawl.htmlBytes,
    contentEncoding: crawl.contentEncoding,
    truncated: crawl.truncated,
    robots,
    sitemap,
    note: 'Crawler reads server HTML only and does not run JavaScript.',
  };
}

/** The crawl details kept in signals. The HTML itself is deliberately left out. */
function crawlSummary(crawl) {
  return {
    source: crawl.source,
    url: crawl.url,
    finalUrl: crawl.finalUrl,
    status: crawl.status,
    responseMs: crawl.responseMs,
    htmlBytes: crawl.htmlBytes,
    redirects: crawl.redirects,
    truncated: crawl.truncated,
  };
}

module.exports = { buildTechnical, crawlSummary };
