const { runAnalysis } = require('../ai/analysis');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Step 8 (analysis) and step 9 (save). They stay separate because the spec lists them separately.
 * @param {{ store: object, env: object, getRedis: Function, analyzeWithClaude: Function, delayMs: number, sleep?: Function }} options
 */
function createAnalysisSteps({ store, env, getRedis, analyzeWithClaude, delayMs, sleep = pause }) {
  return {
    analysis: async (context) => {
      const client = context.audit.client;
      const signals = context.signals;
      context.analysis = await runAnalysis({ client, signals }, { env, getRedis, analyzeWithClaude });
      if (context.analysis.source === 'mock' && delayMs > 0) await sleep(delayMs);
    },
    save: async (context) => {
      const { source, fallbackReason, result, warnings, model, usage } = context.analysis;
      // Everything except Claude's own JSON goes in signals.meta, so `result` stays exactly as the spec describes.
      context.signals = {
        ...context.signals,
        meta: {
          ...context.signals.meta,
          aiSource: source,
          aiFallbackReason: fallbackReason,
          model,
          usage,
          warnings: [...context.signals.meta.warnings, ...warnings],
        },
      };
      await store.saveResult(context.audit.id, {
        result,
        overallScore: result.overall_score,
        scoreBreakdown: result.score_breakdown,
        signals: context.signals,
      });
    },
  };
}

module.exports = { createAnalysisSteps };
