const cheerio = require('cheerio');

const LOCAL_BUSINESS = {
  required: ['name', 'address'],
  recommended: ['telephone', 'url', 'openingHoursSpecification', 'geo', 'image', 'priceRange'],
};

/** A small rule table for common business types. This is not Google's Rich Results Test. */
const RULES = {
  LocalBusiness: LOCAL_BUSINESS,
  Dentist: LOCAL_BUSINESS,
  MedicalClinic: LOCAL_BUSINESS,
  Physician: LOCAL_BUSINESS,
  RealEstateAgent: LOCAL_BUSINESS,
  Organization: { required: ['name'], recommended: ['url', 'logo', 'contactPoint', 'sameAs'] },
  WebSite: { required: ['url'], recommended: ['name'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
};
const LOCAL_TYPES = new Set(['LocalBusiness', 'Dentist', 'MedicalClinic', 'Physician', 'RealEstateAgent']);

const asArray = (value) => (Array.isArray(value) ? value : [value]);
const isFilled = (value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
const typeNames = (node) => asArray(node['@type']).filter(Boolean).map((t) => String(t).replace(/^https?:\/\/schema\.org\//, ''));

/**
 * Step 4. Reads Schema.org data from a page and checks it against the rule table.
 * @param {string} html
 */
function validateSchemaOrg(html) {
  const $ = cheerio.load(html);
  const nodes = [];
  let blocks = 0;
  let parseErrors = 0;

  $('script[type="application/ld+json"]').each((_, element) => {
    blocks += 1;
    try {
      const parsed = JSON.parse($(element).text());
      for (const item of asArray(parsed)) {
        if (item && Array.isArray(item['@graph'])) nodes.push(...item['@graph']);
        else if (item && typeof item === 'object') nodes.push(item);
      }
    } catch {
      parseErrors += 1;
    }
  });

  const types = new Set();
  const missingRequired = [];
  const missingRecommended = [];
  for (const node of nodes) {
    for (const type of typeNames(node)) {
      types.add(type);
      const rule = RULES[type];
      if (!rule) continue;
      for (const property of rule.required) {
        if (!isFilled(node[property])) missingRequired.push({ type, property });
      }
      for (const property of rule.recommended) {
        if (!isFilled(node[property])) missingRecommended.push({ type, property });
      }
    }
  }

  const typeList = [...types].sort();
  return {
    blocks,
    parseErrors,
    types: typeList,
    missingRequired,
    missingRecommended,
    hasLocalBusinessType: typeList.some((type) => LOCAL_TYPES.has(type)),
    hasMicrodata: $('[itemtype]').length > 0,
    method: 'Rule-based check of common business types, not Google Rich Results Test',
  };
}

module.exports = { validateSchemaOrg };
