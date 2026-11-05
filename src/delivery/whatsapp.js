const { IntegrationNotConfiguredError } = require('../lib/errors');
const { USE_MOCKS } = require('../mocks');
const mock = require('../mocks/twilio.mock');

async function sendWhatsApp(clientId, pdfPath, score) {
  if (USE_MOCKS) return mock.sendWhatsApp(clientId, pdfPath, score);
  // Real Twilio call goes here. It needs TWILIO_* and an approved business template.
  throw new IntegrationNotConfiguredError('Twilio WhatsApp is not connected', { integration: 'Twilio WhatsApp' });
}

module.exports = { sendWhatsApp };
