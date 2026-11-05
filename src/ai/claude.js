const AnthropicModule = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { AiResponseError } = require('../lib/errors');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompts');
const { AuditResult, applyListLimits } = require('./schema');

const Anthropic = AnthropicModule.default || AnthropicModule;

const REQUEST_TIMEOUT_MS = 120000;
const MAX_TOKENS = 16000;
// These mean a retry would fail the same way and cost the same again.
const PERMANENT_STATUSES = new Set([400, 401, 403, 404]);

/** @param {string} apiKey */
function createAnthropic(apiKey) {
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
}

/** The exact request sent. No temperature and no prefill: this API version and model reject both with a 400. */
function buildRequest({ model, client, signals }) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(AuditResult) },
    messages: [{ role: 'user', content: buildUserPrompt(client, signals) }],
  };
}

function checkResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new AiResponseError(`Claude declined: ${response.stop_details?.category || 'no category'}`, { retryable: false });
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiResponseError('Claude hit the token limit, so the output was cut off', { retryable: false });
  }
  if (!response.parsed_output) throw new AiResponseError('Claude returned no valid JSON');
  return response.parsed_output;
}

/**
 * Sends the signals to Claude and returns only validated output. Nothing invalid gets past this.
 * @param {{ client: object, signals: object }} input
 * @param {{ anthropic: object, model: string }} deps
 * @returns {Promise<{ result: object, warnings: string[], model: string, usage: { inputTokens: number, outputTokens: number } }>}
 */
async function analyzeWithClaude({ client, signals }, { anthropic, model }) {
  let response;
  try {
    response = await anthropic.messages.parse(buildRequest({ model, client, signals }));
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Rate limits, server errors and dropped connections can succeed on the job's retry.
      const retryable = !PERMANENT_STATUSES.has(err.status);
      throw new AiResponseError(`Claude API error ${err.status ?? 'connection'}`, { retryable });
    }
    throw new AiResponseError(`Claude response failed validation: ${err.name}`);
  }

  const { result, warnings } = applyListLimits(checkResponse(response));
  return {
    result,
    warnings,
    model: response.model || model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    },
  };
}

module.exports = { createAnthropic, buildRequest, analyzeWithClaude };
