// The tokens a run used, as { inputTokens, outputTokens } (plus cachedInputTokens and costUsd when
// the provider says), or null when the provider did not say.

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

function usage(input, output) {
  return input > 0 || output > 0 ? { inputTokens: input, outputTokens: output } : null;
}

/**
 * Claude Code's result event: the input counts tokens read from and written to the prompt cache too.
 * total_cost_usd is what the request would cost at API prices (Claude Code works it out per model).
 */
export function claudeUsage(u, totalCostUsd) {
  if (!u || typeof u !== 'object') return null;
  const result = usage(count(u.input_tokens) + count(u.cache_creation_input_tokens) + count(u.cache_read_input_tokens), count(u.output_tokens));
  if (result && Number.isFinite(totalCostUsd) && totalCostUsd >= 0) result.costUsd = totalCostUsd;
  return result;
}

/** Codex's turn.completed event: input_tokens already includes the cached ones, given apart for the price. */
export function codexUsage(u) {
  if (!u || typeof u !== 'object') return null;
  const result = usage(count(u.input_tokens), count(u.output_tokens));
  const cached = count(u.cached_input_tokens);
  if (result && cached > 0) result.cachedInputTokens = Math.min(cached, result.inputTokens);
  return result;
}

/** Ollama's last chat event. */
export function ollamaUsage(event) {
  if (!event || typeof event !== 'object') return null;
  return usage(count(event.prompt_eval_count), count(event.eval_count));
}
