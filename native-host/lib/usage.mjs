// The tokens a run used, as { inputTokens, outputTokens }, or null when the provider did not say.

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

function usage(input, output) {
  return input > 0 || output > 0 ? { inputTokens: input, outputTokens: output } : null;
}

/** Claude Code's result event: the input counts tokens read from and written to the prompt cache too. */
export function claudeUsage(u) {
  if (!u || typeof u !== 'object') return null;
  return usage(count(u.input_tokens) + count(u.cache_creation_input_tokens) + count(u.cache_read_input_tokens), count(u.output_tokens));
}

/** Codex's turn.completed event: input_tokens already includes the cached ones. */
export function codexUsage(u) {
  if (!u || typeof u !== 'object') return null;
  return usage(count(u.input_tokens), count(u.output_tokens));
}

/** Ollama's last chat event. */
export function ollamaUsage(event) {
  if (!event || typeof event !== 'object') return null;
  return usage(count(event.prompt_eval_count), count(event.eval_count));
}
