import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/lib/history';
import { formatCost, formatUsage, usageByProvider } from '@/lib/usage';

const t = (key: string) =>
  ({
    ui_usage_tokens: '{input} tokens in, {output} out',
    ui_usage_time: '{seconds} s',
    ui_usage_cost: '≈ {cost} estimated at API prices',
    ui_usage_local: 'local, no API cost',
  })[key] ?? key;

describe('formatUsage', () => {
  it('writes the tokens and the seconds with the locale', () => {
    expect(formatUsage({ ms: 8_340, inputTokens: 12_345, outputTokens: 420 }, t, 'en-US')).toBe('12,345 tokens in, 420 out · 8.3 s');
    expect(formatUsage({ ms: 8_340, inputTokens: 12_345, outputTokens: 420 }, t, 'de-DE')).toBe('12.345 tokens in, 420 out · 8,3 s');
  });

  it('writes only what is known', () => {
    expect(formatUsage({ ms: 2_000 }, t, 'en-US')).toBe('2.0 s');
    expect(formatUsage({ ms: 0, inputTokens: 5, outputTokens: 1 }, t, 'en-US')).toBe('5 tokens in, 1 out');
    expect(formatUsage(undefined, t, 'en-US')).toBe('');
  });
});

describe('cost', () => {
  it('writes the estimate between the tokens and the time', () => {
    expect(formatUsage({ ms: 4_600, inputTokens: 1_087, outputTokens: 167, costUsd: 0.01134 }, t, 'en-US')).toBe(
      '1,087 tokens in, 167 out · ≈ $0.011 estimated at API prices · 4.6 s',
    );
    expect(formatUsage({ ms: 0, inputTokens: 1, outputTokens: 1, costUsd: 0.000129 }, t, 'en-US')).toContain('≈ $0.00013 ');
    expect(formatUsage({ ms: 0, inputTokens: 1, outputTokens: 1, costUsd: 12.345 }, t, 'en-US')).toContain('≈ $12.35 ');
  });

  it('says a local model has no API cost', () => {
    expect(formatUsage({ ms: 1000, inputTokens: 10, outputTokens: 2, local: true }, t, 'en-US')).toBe('10 tokens in, 2 out · local, no API cost · 1.0 s');
  });
});

describe('formatCost', () => {
  it('follows the locale', () => {
    expect(formatCost(0.0123, 'en-US')).toBe('$0.012');
    expect(formatCost(1.5, 'de-DE')).toMatch(/^1,50\s\$$/);
    expect(formatCost(0, 'en-US')).toBe('$0.00');
  });
});

describe('usageByProvider', () => {
  const entry = (provider: HistoryEntry['provider'], usage?: HistoryEntry['usage']) => ({ provider, usage }) as HistoryEntry;

  it('adds up the tokens per provider, in a fixed order, leaving out summaries without them', () => {
    expect(
      usageByProvider([
        entry('ollama', { ms: 1, inputTokens: 10, outputTokens: 2, local: true }),
        entry('claude', { ms: 1, inputTokens: 100, outputTokens: 20, costUsd: 0.5 }),
        entry('claude', { ms: 1, inputTokens: 50, outputTokens: 5, costUsd: 0.25 }),
        entry('claude', { ms: 1 }),
        entry('codex'),
      ]),
    ).toEqual([
      { provider: 'claude', count: 2, inputTokens: 150, outputTokens: 25, costUsd: 0.75 },
      { provider: 'ollama', count: 1, inputTokens: 10, outputTokens: 2, local: true },
    ]);
  });
});
