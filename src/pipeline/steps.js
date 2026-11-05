const { createAnalysisSteps } = require('./analysisSteps');
const { createReportSteps } = require('./reportSteps');
const { createSignalSteps, hasAllSignals, SIGNAL_STEP_KEYS } = require('./signalSteps');

/** All the steps of a run, by key. */
function createSteps(options) {
  return {
    ...createSignalSteps(options),
    ...createAnalysisSteps(options),
    ...createReportSteps(options),
  };
}

/** True when an earlier attempt already finished this step, so it is neither repeated nor paid for twice. */
function isStepDone(key, audit) {
  if (SIGNAL_STEP_KEYS.includes(key)) return hasAllSignals(audit.signals);
  if (key === 'analysis' || key === 'save') return Boolean(audit.result);
  if (key === 'pdf') return Boolean(audit.report);
  return false; // Delivery checks each channel itself.
}

module.exports = { createSteps, isStepDone };
