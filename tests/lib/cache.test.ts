import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cacheKey, clearCached, getCached, getLastCached, setCached } from '@/lib/cache';

const base = { provider: 'claude' as const, model: 'sonnet', length: 'medium' as const, language: 'gl' as const };
const entry = (key: string, text = 'summary') => ({ key, title: 'T', text, truncated: false });

describe('cacheKey', () => {
  it('changes when any input changes', () => {
    const k = cacheKey('https://e.com/a', base);
    expect(cacheKey('https://e.com/a', base)).toBe(k);
    expect(cacheKey('https://e.com/b', base)).not.toBe(k);
    expect(cacheKey('https://e.com/a', { ...base, provider: 'codex' })).not.toBe(k);
    expect(cacheKey('https://e.com/a', { ...base, model: 'opus' })).not.toBe(k);
    expect(cacheKey('https://e.com/a', { ...base, length: 'long' })).not.toBe(k);
    expect(cacheKey('https://e.com/a', { ...base, language: 'en' })).not.toBe(k);
  });
});

describe('summary cache', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns the entry for the same key', async () => {
    await setCached(1, entry('k1'));
    expect(await getCached(1, 'k1')).toEqual(entry('k1'));
  });

  it('returns null for another key or another tab', async () => {
    await setCached(1, entry('k1'));
    expect(await getCached(1, 'k2')).toBeNull();
    expect(await getCached(2, 'k1')).toBeNull();
  });

  it('keeps one entry per tab', async () => {
    await setCached(1, entry('k1'));
    await setCached(1, entry('k2', 'new'));
    expect(await getCached(1, 'k1')).toBeNull();
    expect((await getCached(1, 'k2'))?.text).toBe('new');
  });

  it('clears a tab', async () => {
    await setCached(1, entry('k1'));
    await clearCached(1);
    expect(await getCached(1, 'k1')).toBeNull();
  });

  it('returns the last entry of a tab whatever its key', async () => {
    expect(await getLastCached(1)).toBeNull();
    await setCached(1, entry('k1', 'last'));
    expect((await getLastCached(1))?.text).toBe('last');
  });
});
