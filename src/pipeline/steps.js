const { createSignalSteps, hasAllSignals, SIGNAL_STEP_KEYS } = require('./signalSteps');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LATER_STEPS = ['analysis', 'save', 'pdf', 'delivery'];

/**
 * Placeholders for the steps still to come. Phases 4 and 5 replace them.
 * @param {{ delayMs: number, sleep?: (ms: number) => Promise<void> }} options
 */
function createStubSteps({ delayMs, sleep = pause }) {
  return Object.fromEntries(LATER_STEPS.map((key) => [key, () => sleep(delayMs)]));
}

/** All the steps of a run, by key. */
function createSteps(options) {
  return { ...createSignalSteps(options), ...createStubSteps({ delayMs: options.delayMs, sleep: options.sleep }) };
}

/** True when an earlier attempt already finished this step. */
function isStepDone(key, audit) {
  if (SIGNAL_STEP_KEYS.includes(key)) return hasAllSignals(audit.signals);
  return false;
}

module.exports = { createStubSteps, createSteps, isStepDone };
