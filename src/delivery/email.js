const { IntegrationNotConfiguredError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const mock = require('../mocks/email.mock');

async function sendEmail(clientId, pdfPath, score) {
  if (USE_MOCKS) return mock.sendEmail(clientId, pdfPath, score);
  // Real email provider call goes here. It needs EMAIL_*.
  throw new IntegrationNotConfiguredError('Email is not connected', { integration: 'Email' });
}

module.exports = { sendEmail };
