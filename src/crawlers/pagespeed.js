const { IntegrationNotConfiguredError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/pagespeed.mock');

async function getPageSpeed(url) {
  if (USE_MOCKS) return mockData;
  // Real PageSpeed Insights API call goes here. It needs PAGESPEED_API_KEY.
  throw new IntegrationNotConfiguredError(`PageSpeed Insights is not connected for ${url}`, {
    integration: 'PageSpeed Insights',
  });
}

module.exports = { getPageSpeed };
