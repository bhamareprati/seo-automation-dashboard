const { analyzeOnPage } = require('../analyzers/onpage');
const { validateSchemaOrg } = require('../analyzers/schemaorg');
const { buildTechnical, crawlSummary } = require('../analyzers/technical');
const { getSearchConsole } = require('../crawlers/gsc');
const { getRankings } = require('../crawlers/dataforseo');
const { getPageSpeed } = require('../crawlers/pagespeed');
const { checkRobotsAndSitemap } = require('../crawlers/robots');
const { crawlSite } = require('../crawlers/site');

const SIGNAL_SECTIONS = ['crawl', 'technical', 'onPage', 'schema', 'cwv', 'gsc', 'rankings'];
const SIGNAL_STEP_KEYS = ['crawl', 'pagespeed', 'gsc', 'schema', 'onPage', 'robots', 'rankings'];

/** True once a run has saved every section, so a retry can skip steps 1 to 7. */
const hasAllSignals = (signals) => SIGNAL_SECTIONS.every((section) => signals?.[section]);

const emptySignals = (usedMocks) => ({
  meta: {
    schemaVersion: 1,
    usedMocks,
    crawlSource: null,
    aiSource: null,
    aiFallbackReason: null,
    model: null,
    usage: null,
    stepMs: {},
    warnings: [],
  },
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Steps 1 to 7. Each writes its own section of `context.signals`.
 * @param {{ store: object, usedMocks: boolean, delayMs: number, timeoutMs: number, sleep?: Function, fetchPage?: Function }} options
 */
function createSignalSteps({ store, usedMocks, delayMs, timeoutMs, sleep = pause, fetchPage }) {
  // Mocked calls return instantly. A short delay lets people see the progress, as the README explains.
  const mockDelay = () => (usedMocks && delayMs > 0 ? sleep(delayMs) : undefined);
  const websiteUrl = (context) => context.audit.client.websiteUrl;

  return {
    crawl: async (context) => {
      context.signals = emptySignals(usedMocks);
      context.page = await crawlSite(websiteUrl(context), { fetchPage, timeoutMs });
      context.signals.meta.crawlSource = context.page.source;
      context.signals.crawl = crawlSummary(context.page);
      if (context.page.truncated) context.signals.meta.warnings.push('Homepage was larger than 2 MB and was cut short.');
      if (context.page.source === 'fixture') await mockDelay();
    },
    pagespeed: async (context) => {
      context.signals.cwv = await getPageSpeed(websiteUrl(context));
      await mockDelay();
    },
    gsc: async (context) => {
      context.signals.gsc = await getSearchConsole(websiteUrl(context));
      await mockDelay();
    },
    schema: async (context) => {
      context.signals.schema = validateSchemaOrg(context.page.html);
    },
    onPage: async (context) => {
      context.signals.onPage = analyzeOnPage(context.page.html, {
        url: context.page.finalUrl,
        city: context.audit.client.city,
      });
    },
    robots: async (context) => {
      const files = await checkRobotsAndSitemap(context.page, { fetchPage, timeoutMs });
      context.signals.technical = buildTechnical(context.page, files);
    },
    rankings: async (context) => {
      context.signals.rankings = await getRankings(websiteUrl(context));
      await store.saveSignals(context.audit.id, context.signals);
      await mockDelay();
    },
  };
}

module.exports = { createSignalSteps, hasAllSignals, emptySignals, SIGNAL_SECTIONS, SIGNAL_STEP_KEYS };
