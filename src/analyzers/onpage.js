const cheerio = require('cheerio');

// Caps on anything taken from the page. They limit both cost and prompt injection:
// only short, extracted fields ever reach Claude, never the page body.
const CAPS = { title: 200, description: 320, heading: 200, headings: 20 };

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const cap = (text, limit) => clean(text).slice(0, limit);
const PHONE = /(?:\+?91[\s-]?)?(?:0?\d{2,4}[\s-]?)?\d{3,4}[\s-]?\d{4}\b/;
const ADDRESS_WORDS = /\b(road|rd\.|street|nagar|lane|marg|chowk|pune \d{6}|pin ?code|\d{6})\b/i;

/**
 * Step 5. Pure function of the page's HTML: no network, nothing stored but these fields.
 * @param {string} html
 * @param {{ url: string, city?: string }} context
 */
function analyzeOnPage(html, { url, city }) {
  const $ = cheerio.load(html);
  const pageOrigin = new URL(url).origin;

  const title = cap($('head > title').first().text(), CAPS.title);
  const description = cap($('meta[name="description"]').attr('content'), CAPS.description);

  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    if (headings.length < CAPS.headings) {
      headings.push({ level: Number(element.tagName.slice(1)), text: cap($(element).text(), CAPS.heading) });
    }
  });
  const levels = $('h1, h2, h3, h4, h5, h6').map((_, element) => Number(element.tagName.slice(1))).get();
  const skipsHeadingLevel = levels.some((level, index) => index > 0 && level > levels[index - 1] + 1);

  const images = $('img');
  const imagesMissingAlt = images.filter((_, element) => !clean($(element).attr('alt'))).length;

  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      if (new URL(href, url).origin === pageOrigin) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      // A broken link isn't counted as either kind.
    }
  });

  const bodyText = clean($('body').clone().find('script, style, noscript').remove().end().text());
  const openGraph = {
    title: Boolean($('meta[property="og:title"]').attr('content')),
    description: Boolean($('meta[property="og:description"]').attr('content')),
    image: Boolean($('meta[property="og:image"]').attr('content')),
  };

  return {
    url,
    title,
    titleLength: clean($('head > title').first().text()).length,
    metaDescription: description || null,
    metaDescriptionLength: clean($('meta[name="description"]').attr('content')).length,
    h1Count: $('h1').length,
    headings,
    skipsHeadingLevel,
    imageCount: images.length,
    imagesMissingAlt,
    wordCount: bodyText ? bodyText.split(' ').length : 0,
    internalLinks,
    externalLinks,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    lang: $('html').attr('lang') || null,
    hasViewport: $('meta[name="viewport"]').length > 0,
    openGraph,
    mentionsCity: Boolean(city) && bodyText.toLowerCase().includes(city.toLowerCase()),
    hasPhoneNumber: $('a[href^="tel:"]').length > 0 || PHONE.test(bodyText),
    hasAddress: $('address').length > 0 || ADDRESS_WORDS.test(bodyText),
    renderBlockingScriptsInHead: $('head script[src]:not([async]):not([defer])').length,
  };
}

module.exports = { analyzeOnPage, CAPS };
