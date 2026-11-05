const sampleAnalysis = require('../mocks/claude.mock');
const { applyListLimits } = require('./schema');

const TWO_DAYS_SECONDS = 48 * 60 * 60;

/**
 * The mode matrix in docs/TRD.md section 5.2. USE_MOCKS=false with no key never gets here,
 * because configuration refuses to load.
 * @returns {'claude' | 'mock'}
 */
const chooseAnalysisSource = (env) => (env.ANTHROPIC_API_KEY ? 'claude' : 'mock');

/** Counts today's Claude calls and returns the new total. The key removes itself after two days. */
async function countClaudeCall(redis, now) {
  const key = `ai:calls:${now.toISOString().slice(0, 10)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, TWO_DAYS_SECONDS);
  return count;
}

const sampleResult = (fallbackReason) => {
  const { result, warnings } = applyListLimits(sampleAnalysis);
  return { source: 'mock', fallbackReason, result, warnings, model: null, usage: null };
};

/**
 * Step 8. Uses real Claude when a key is set, until today's cap, then the labelled sample.
 * The caller records `source`, so sample output is never presented as real.
 * @param {{ client: object, signals: object }} input
 * @param {{ env: object, getRedis: Function, analyzeWithClaude: Function, now?: () => Date }} deps
 */
async function runAnalysis(input, { env, getRedis, analyzeWithClaude, now = () => new Date() }) {
  if (chooseAnalysisSource(env) === 'mock') return sampleResult(null);

  const count = await countClaudeCall(await getRedis(), now());
  if (count > env.MAX_REAL_AI_AUDITS_PER_DAY) return sampleResult('daily_cap');

  const analysis = await analyzeWithClaude(input);
  return { source: 'claude', fallbackReason: null, ...analysis };
}

module.exports = { chooseAnalysisSource, runAnalysis };
