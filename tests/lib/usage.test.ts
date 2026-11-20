import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/lib/history';
import { formatUsage, usageByProvider } from '@/lib/usage';

const t = (key: string) =>
  ({ ui_usage_tokens: '{input} tokens in, {output} out', ui_usage_time: '{seconds} s' })[key] ?? key;

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

describe('usageByProvider', () => {
  const entry = (provider: HistoryEntry['provider'], usage?: HistoryEntry['usage']) => ({ provider, usage }) as HistoryEntry;

  it('adds up the tokens per provider, in a fixed order, leaving out summaries without them', () => {
    expect(
      usageByProvider([
        entry('ollama', { ms: 1, inputTokens: 10, outputTokens: 2 }),
        entry('claude', { ms: 1, inputTokens: 100, outputTokens: 20 }),
        entry('claude', { ms: 1, inputTokens: 50, outputTokens: 5 }),
        entry('claude', { ms: 1 }),
        entry('codex'),
      ]),
    ).toEqual([
      { provider: 'claude', count: 2, inputTokens: 150, outputTokens: 25 },
      { provider: 'ollama', count: 1, inputTokens: 10, outputTokens: 2 },
    ]);
  });
});
