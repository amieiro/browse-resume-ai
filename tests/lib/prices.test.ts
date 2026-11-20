import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ensureFreshPrices, getPrices, openAiCost, PRICES_KEY, resetPriceState } from '@/lib/prices';

const SOL = { input: 2, output: 10, cachedInput: 0.1 };
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  fakeBrowser.reset();
  resetPriceState();
});

describe('ensureFreshPrices', () => {
  it('downloads the prices once and keeps them for a day', async () => {
    const fetchPrices = vi.fn(async () => ({ 'gpt-6.2-sol': SOL }));
    let now = 1_000_000;
    await ensureFreshPrices({ fetchPrices, now: () => now });
    expect(await getPrices()).toEqual({ checkedAt: 1_000_000, openai: { 'gpt-6.2-sol': SOL } });
    now += 23 * HOUR;
    await ensureFreshPrices({ fetchPrices, now: () => now });
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    now += 2 * HOUR;
    await ensureFreshPrices({ fetchPrices, now: () => now });
    expect(fetchPrices).toHaveBeenCalledTimes(2);
  });

  it('keeps the old prices when the download fails, and waits an hour to try again', async () => {
    await fakeBrowser.storage.local.set({ [PRICES_KEY]: { checkedAt: 0, openai: { 'gpt-6.2-sol': SOL } } });
    const fetchPrices = vi.fn(async () => null);
    let now = 10 * 24 * HOUR;
    expect(await ensureFreshPrices({ fetchPrices, now: () => now })).toMatchObject({ checkedAt: 0 });
    now += HOUR / 2;
    await ensureFreshPrices({ fetchPrices, now: () => now });
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    now += HOUR;
    await ensureFreshPrices({ fetchPrices, now: () => now });
    expect(fetchPrices).toHaveBeenCalledTimes(2);
  });

  it('downloads again when forced (the extension was installed or updated)', async () => {
    const fetchPrices = vi.fn(async () => ({ 'gpt-6.2-sol': SOL }));
    await ensureFreshPrices({ fetchPrices, now: () => 5 });
    await ensureFreshPrices({ fetchPrices, now: () => 6 }, true);
    expect(fetchPrices).toHaveBeenCalledTimes(2);
  });
});

describe('openAiCost', () => {
  const table = { checkedAt: 0, openai: { 'gpt-6.2-sol': SOL, 'gpt-6-luna': { input: 0.1, output: 0.5 } } };

  it('prices cached input apart from the rest', () => {
    // 10,000 new input × $2 + 4,000 cached × $0.10 + 500 output × $10, per million.
    expect(openAiCost({ inputTokens: 14_000, cachedInputTokens: 4_000, outputTokens: 500 }, 'gpt-6.2-sol', table)).toBeCloseTo(0.0254, 10);
  });

  it('uses the input price for cached tokens when there is no cache price', () => {
    expect(openAiCost({ inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 0 }, 'gpt-6-luna', table)).toBeCloseTo(0.1, 10);
  });

  it('is null for a model without a price, or without prices', () => {
    expect(openAiCost({ inputTokens: 1, outputTokens: 1 }, 'gpt-unknown', table)).toBeNull();
    expect(openAiCost({ inputTokens: 1, outputTokens: 1 }, 'gpt-6.2-sol', null)).toBeNull();
  });
});
