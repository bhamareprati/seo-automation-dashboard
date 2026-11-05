const { IntegrationNotConfiguredError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/dataforseo.mock');

async function getRankings(url) {
  if (USE_MOCKS) return mockData;
  // Real DataForSEO SERP API call goes here. It needs DATAFORSEO_*.
  throw new IntegrationNotConfiguredError(`DataForSEO is not connected for ${url}`, {
    integration: 'DataForSEO',
  });
}

module.exports = { getRankings };
