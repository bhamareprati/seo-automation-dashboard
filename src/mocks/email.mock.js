// Added to the spec's mocks. It has the same shape as the spec's twilio.mock.js.
async function sendEmail(clientId, pdfPath, score) {
  console.log('[MOCK EMAIL] → Client:', clientId);
  console.log('[MOCK EMAIL] → Score: ', score + '/100');
  console.log('[MOCK EMAIL] → Report:', pdfPath);
  return { status: 'mock_sent', id: 'MOCK_EMAIL_' + Date.now() };
}
module.exports = { sendEmail };
