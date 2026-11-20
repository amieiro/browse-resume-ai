import { describe, expect, it } from 'vitest';
import { claudeUsage, codexUsage, ollamaUsage } from '../lib/usage.mjs';

describe('usage', () => {
  it('adds the prompt cache to the Claude Code input', () => {
    expect(claudeUsage({ input_tokens: 2, cache_creation_input_tokens: 633, cache_read_input_tokens: 100, output_tokens: 5 })).toEqual({ inputTokens: 735, outputTokens: 5 });
  });

  it('takes the Codex input as it is (it includes the cached tokens), and the cached ones apart', () => {
    expect(codexUsage({ input_tokens: 14697, cached_input_tokens: 3968, output_tokens: 5, reasoning_output_tokens: 0 })).toEqual({ inputTokens: 14697, outputTokens: 5, cachedInputTokens: 3968 });
    expect(codexUsage({ input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 })).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('keeps the cost Claude Code reports', () => {
    expect(claudeUsage({ input_tokens: 2, output_tokens: 5 }, 0.00013)).toEqual({ inputTokens: 2, outputTokens: 5, costUsd: 0.00013 });
    expect(claudeUsage({ input_tokens: 2, output_tokens: 5 }, 'x')).toEqual({ inputTokens: 2, outputTokens: 5 });
  });

  it('reads the Ollama counts', () => {
    expect(ollamaUsage({ done: true, prompt_eval_count: 42, eval_count: 7 })).toEqual({ inputTokens: 42, outputTokens: 7 });
  });

  it('is null when nothing is known, and ignores values that are not counts', () => {
    expect(claudeUsage(undefined)).toBeNull();
    expect(codexUsage({})).toBeNull();
    expect(ollamaUsage({ done: true })).toBeNull();
    expect(claudeUsage({ input_tokens: -3, output_tokens: 'x', cache_read_input_tokens: 4 })).toEqual({ inputTokens: 4, outputTokens: 0 });
  });
});
