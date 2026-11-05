const { sendEmail } = require('./email');
const { sendWhatsApp } = require('./whatsapp');

const CHANNELS = [
  { channel: 'whatsapp', contact: (client) => client.whatsapp, providerId: (r) => r.sid },
  { channel: 'email', contact: (client) => client.email, providerId: (r) => r.id },
];

/**
 * Step 11. Sends through each channel the client has a contact for and records the outcome.
 * A delivery failure is recorded and never fails the audit. A channel already recorded is skipped, so a retry doesn't send twice.
 * @param {{ client: object, pdfPath: string, score: number, alreadySent: string[] }} input
 * @param {{ recordNotification: Function, senders?: object, logger: object }} deps
 * @returns {Promise<Array<{ channel: string, status: string, providerId: string | null }>>}
 */
async function deliverReport(
  { client, pdfPath, score, alreadySent = [] },
  { recordNotification, senders = { whatsapp: sendWhatsApp, email: sendEmail }, logger },
) {
  const outcomes = [];
  for (const { channel, contact, providerId } of CHANNELS) {
    if (!contact(client) || alreadySent.includes(channel)) continue;
    let outcome;
    try {
      const response = await senders[channel](client.id, pdfPath, score);
      outcome = { channel, status: response.status, providerId: providerId(response) ?? null };
    } catch (err) {
      logger.error('delivery_failed', { clientId: client.id, step: channel, code: err?.code || err?.name });
      outcome = { channel, status: 'failed', providerId: null };
    }
    await recordNotification(outcome);
    outcomes.push(outcome);
  }
  return outcomes;
}

module.exports = { deliverReport };
