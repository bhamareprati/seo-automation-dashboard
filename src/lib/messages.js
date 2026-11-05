/**
 * Every user-facing message. A test checks this list against docs/UI_UX_DESIGN.md section 9.
 * This file also loads in the browser, so it must stay free of secrets and Node-only imports.
 */
const MESSAGES = {
  'M-LOGIN-HINT': 'Reviewing this demo? Test logins are in the README.',
  'M-LOGIN-FAIL': "That email and password don't match. Check them and try again.",
  'M-LOGIN-EMPTY': 'Enter your email and password.',
  'M-AUTH-EXPIRED': 'Your session ended. Sign in again to continue.',
  'M-RECONNECTING': 'Reconnecting to get the latest progress.',
  'M-FORBIDDEN': 'This report belongs to another account.',
  'M-NOT-FOUND': "This audit doesn't exist. Go back to the list to pick another.",
  'M-LOAD-FAIL': "This page didn't load. Reload to try again.",
  'M-EMPTY-CLIENTS': 'No clients yet. Add a client to run the first audit.',
  'M-EMPTY-AUDITS': 'No audits yet. Run one from the client list.',
  'M-CLIENT-DUP': 'A client with this website already exists.',
  'M-URL-INVALID': 'Enter a full website address starting with http:// or https://.',
  'M-URL-BLOCKED': "This address can't be audited because it points to a private network.",
  'M-FIELD-REQUIRED': 'Enter {field}.',
  'M-QUEUED': 'Waiting to start. This usually takes less than a minute.',
  'M-AUDIT-ACTIVE': 'An audit is already running for this client. Opening it now.',
  'M-QUEUE-DOWN': "The audit couldn't be queued. Try again in a minute.",
  'M-AUDIT-DONE': 'Audit finished for {client}: {score} out of 100.',
  'M-FAIL-CRAWL': "Couldn't reach {url}. Check the address and that the site is online, then run the audit again.",
  'M-FAIL-AI': "The analysis didn't finish. The collected data is saved, so retrying won't collect it again.",
  'M-FAIL-CONFIG': "{integration} isn't configured. Set its keys or turn sample data on.",
  'M-FAIL-GENERIC': 'The audit stopped at "{step}". Retry it, and check the logs if it stops at the same step.',
  'M-PDF-MISSING': "The report is ready, but its PDF wasn't created. Generate the PDF to try again.",
  'M-PDF-DOWNLOAD-FAIL': "The PDF didn't download. Try again.",
  'M-CLIENT-EMPTY': "Your first report isn't ready yet. It will appear here when the audit finishes.",
  'M-CLIENT-FAILED': "Your latest audit didn't finish. Your previous report is below.",
  'M-SAMPLE-DATA':
    'Some figures are sample data. Page speed, Search Console and ranking figures are examples, not measurements of this website.',
  'M-AI-REAL': 'Analysed by Claude ({model})',
  'M-AI-SAMPLE': 'Sample analysis: a prepared example, not written by Claude for this website.',
  'M-AI-CAP': "Today's limit for Claude analyses is used up, so this audit uses the sample analysis.",
  'M-DELIVERY-SIM': 'Delivery is simulated in this demo. No message was actually sent.',
  'M-NOTIF-READY': 'Your report for {date} is ready.',
  'M-NOTIF-CHANNEL': '{channel} message simulated for {client}.',
};

/** Returns a message with its {placeholders} filled in. */
function message(id, values = {}) {
  const text = MESSAGES[id];
  if (!text) throw new Error(`Unknown message ID: ${id}`);
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

module.exports = { MESSAGES, message };
