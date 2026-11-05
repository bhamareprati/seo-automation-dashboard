const { IntegrationNotConfiguredError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const mockData = require('../mocks/gsc.mock');

async function getSearchConsole(url) {
  if (USE_MOCKS) return mockData;
  // Real Google Search Console API call goes here. It needs OAuth and domain verification (GSC_*).
  throw new IntegrationNotConfiguredError(`Google Search Console is not connected for ${url}`, {
    integration: 'Google Search Console',
  });
}

module.exports = { getSearchConsole };
