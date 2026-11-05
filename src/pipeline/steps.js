const { AUDIT_STEPS } = require('../lib/auditSteps');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Placeholder steps, so the queue and live progress can be proven first.
 * Phases 3, 4 and 5 replace these one by one.
 * @param {{ delayMs: number, sleep?: (ms: number) => Promise<void> }} options
 * @returns {Record<string, (context: object) => Promise<void>>}
 */
function createStubSteps({ delayMs, sleep = pause }) {
  return Object.fromEntries(AUDIT_STEPS.map(({ key }) => [key, () => sleep(delayMs)]));
}

module.exports = { createStubSteps };
