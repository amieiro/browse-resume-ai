import { describe, expect, it } from 'vitest';
import { openAiPrices } from '../lib/prices.mjs';

describe('openAiPrices', () => {
  it('keeps the OpenAI models, in dollars per million tokens', () => {
    expect(
      openAiPrices({
        sample_spec: { input_cost_per_token: 0 },
        'gpt-6.2-sol': { litellm_provider: 'openai', mode: 'chat', input_cost_per_token: 2e-6, output_cost_per_token: 1e-5, cache_read_input_token_cost: 1e-7 },
        'gpt-6-luna': { litellm_provider: 'openai', input_cost_per_token: 1e-7, output_cost_per_token: 5e-7 },
        'azure/gpt-6.2-sol': { litellm_provider: 'azure', input_cost_per_token: 1, output_cost_per_token: 1 },
        'openai/gpt-x': { litellm_provider: 'openai', input_cost_per_token: 1, output_cost_per_token: 1 },
        'claude-sonnet': { litellm_provider: 'anthropic', input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5 },
        'gpt-image': { litellm_provider: 'openai', input_cost_per_token: 'free', output_cost_per_token: 1e-5 },
        'gpt-neg': { litellm_provider: 'openai', input_cost_per_token: -1, output_cost_per_token: 1e-5 },
      }),
    ).toEqual({
      'gpt-6.2-sol': { input: 2, output: 10, cachedInput: 0.1 },
      'gpt-6-luna': { input: 0.1, output: 0.5 },
    });
  });

  it('is empty for something that is not a price list', () => {
    expect(openAiPrices(null)).toEqual({});
    expect(openAiPrices('x')).toEqual({});
  });
});
