/**
 * One JSON line per event. Only IDs, counts and timings are allowed through, so page content,
 * prompts, responses and secrets cannot reach the logs by accident.
 */
const ALLOWED_FIELDS = new Set(['auditId', 'clientId', 'jobId', 'step', 'ms', 'code', 'count', 'attempt', 'source']);

function write(level, event, fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = value;
  }
  process.stdout.write(`${JSON.stringify({ level, event, ...safe })}\n`);
}

const logger = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};

module.exports = { logger };
