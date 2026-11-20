import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defaultSettings, type Settings } from '@/lib/settings';
import { Summarizer, type SummarizerDeps, type SummaryState } from '@/lib/summarizer';
import { SummaryError, type Availability, type Provider } from '@/providers/types';
import type { Article } from '@/lib/prompt';

const article: Article = { title: 'Title', text: 'text', url: 'https://e.com/a', truncated: false };

function provider(
  impl: (signal: AbortSignal) => AsyncIterable<string>,
  availability: Availability = { ok: true },
): Provider & { calls: number } {
  const p = {
    id: 'claude' as const,
    label: 'Claude',
    calls: 0,
    checkAvailability: async () => availability,
    summarize(_prompt: string, _model: string, signal: AbortSignal) {
      p.calls++;
      return impl(signal);
    },
  };
  return p;
}

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

function waitForAbort(signal: AbortSignal): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield 'partial';
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    },
  };
}

function setup(p: Provider, overrides: Partial<SummarizerDeps> = {}, settings: Partial<Settings> = {}) {
  let current: Settings = { ...defaultSettings('en'), ...settings };
  const deps: SummarizerDeps = {
    extract: vi.fn(async () => article),
    loadSettings: async () => current,
    getProvider: () => p,
    ...overrides,
  };
  const s = new Summarizer(deps);
  const states: SummaryState[] = [];
  return {
    s,
    deps,
    states,
    setSettings: (patch: Partial<Settings>) => (current = { ...current, ...patch }),
    listen: (tabId = 1) => s.subscribe(tabId, (st) => states.push(structuredClone(st))),
  };
}

describe('Summarizer', () => {
  beforeEach(() => fakeBrowser.reset());

  it('streams running states then done', async () => {
    const t = setup(provider(() => chunks('Hel', 'lo')));
    t.listen();
    await t.s.start(1, { force: false });
    expect(t.states.map((s) => [s.status, 'text' in s ? s.text : null])).toEqual([
      ['idle', null],
      ['running', ''],
      ['running', ''],
      ['running', 'Hel'],
      ['running', 'Hello'],
      ['done', 'Hello'],
    ]);
  });

  it('shows running at once, while the page is still being read', async () => {
    let release!: (a: Article) => void;
    const extract = vi.fn(() => new Promise<Article>((r) => (release = r)));
    const t = setup(provider(() => chunks('Hi')), { extract });
    const started = t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'running', title: '', text: '' });
    await vi.waitFor(() => expect(extract).toHaveBeenCalled());
    release(article);
    await started;
    expect(t.s.getState(1)).toMatchObject({ status: 'done', text: 'Hi' });
  });

  it('serves the second start from the cache', async () => {
    const p = provider(() => chunks('Hello'));
    const t = setup(p);
    await t.s.start(1, { force: false });
    await t.s.start(1, { force: false });
    expect(p.calls).toBe(1);
    expect(t.s.getState(1)).toMatchObject({ status: 'done', text: 'Hello' });
  });

  it('serves the cache to a new Summarizer (service worker restart)', async () => {
    const p = provider(() => chunks('Hello'));
    await setup(p).s.start(1, { force: false });
    const t2 = setup(p);
    await t2.s.start(1, { force: false });
    expect(p.calls).toBe(1);
    expect(t2.s.getState(1)).toMatchObject({ status: 'done', text: 'Hello' });
  });

  it('regenerates when forced', async () => {
    const p = provider(() => chunks('Hello'));
    const t = setup(p);
    await t.s.start(1, { force: false });
    await t.s.start(1, { force: true });
    expect(p.calls).toBe(2);
  });

  it('regenerates when a setting changed', async () => {
    const p = provider(() => chunks('Hello'));
    const t = setup(p);
    await t.s.start(1, { force: false });
    t.setSettings({ language: 'gl' });
    await t.s.start(1, { force: false });
    expect(p.calls).toBe(2);
  });

  it('reports no_content when there is no article', async () => {
    const t = setup(provider(() => chunks('x')), { extract: async () => null });
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'no_content' });
  });

  it('passes extraction error codes through', async () => {
    const t = setup(provider(() => chunks('x')), {
      extract: async () => {
        throw new SummaryError('needs_click');
      },
    });
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'needs_click' });
  });

  it('stops when the provider is unavailable', async () => {
    const p = provider(() => chunks('x'), { ok: false, code: 'host_missing' });
    const t = setup(p);
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'host_missing' });
    expect(p.calls).toBe(0);
  });

  it('keeps partial text when the provider fails, and caches nothing', async () => {
    const p = provider(async function* () {
      yield 'Hel';
      throw new Error('boom');
    });
    const t = setup(p);
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'provider_failed', text: 'Hel' });
    await t.s.start(1, { force: false });
    expect(p.calls).toBe(2);
  });

  it('keeps the code of a SummaryError thrown by the provider', async () => {
    const t = setup(
      provider(async function* () {
        throw new SummaryError('claude_auth');
      }),
    );
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'claude_auth' });
  });

  it('keeps the provider error detail for the user', async () => {
    const t = setup(
      provider(async function* () {
        throw new SummaryError('usage_limit', 'resets 3pm');
      }),
    );
    await t.s.start(1, { force: false });
    expect(t.s.getState(1)).toMatchObject({ status: 'error', code: 'usage_limit', detail: 'resets 3pm' });
  });

  it('a new start supersedes the running one', async () => {
    let first: AbortSignal | undefined;
    let n = 0;
    const p = provider((signal) => {
      n++;
      if (n === 1) {
        first = signal;
        return waitForAbort(signal);
      }
      return chunks('Second');
    });
    const t = setup(p);
    t.listen();
    const running = t.s.start(1, { force: false });
    await vi.waitFor(() => expect(first).toBeDefined());
    await t.s.start(1, { force: true });
    await running;
    expect(first!.aborted).toBe(true);
    expect(t.s.getState(1)).toMatchObject({ status: 'done', text: 'Second' });
    expect(t.states.some((s) => s.status === 'error')).toBe(false);
  });

  it('a non-forced start on the same page attaches to the running request', async () => {
    let first: AbortSignal | undefined;
    const p = provider((signal) => ((first ??= signal), waitForAbort(signal)));
    const t = setup(p);
    const running = t.s.start(1, { force: false });
    await vi.waitFor(() => expect(t.s.getState(1)).toMatchObject({ text: 'partial' }));
    await t.s.start(1, { force: false });
    expect(p.calls).toBe(1);
    expect(first!.aborted).toBe(false);
    expect(t.s.getState(1)).toMatchObject({ status: 'running', text: 'partial' });
    t.s.forget(1);
    await running;
  });

  it('a non-forced start on another page replaces the running request', async () => {
    let first: AbortSignal | undefined;
    let n = 0;
    const p = provider((signal) => (++n === 1 ? ((first = signal), waitForAbort(signal)) : chunks('B')));
    const extract = vi
      .fn<SummarizerDeps['extract']>()
      .mockResolvedValueOnce(article)
      .mockResolvedValueOnce({ ...article, url: 'https://e.com/b', title: 'B' });
    const t = setup(p, { extract });
    const running = t.s.start(1, { force: false });
    await vi.waitFor(() => expect(first).toBeDefined());
    await t.s.start(1, { force: false });
    await running;
    expect(first!.aborted).toBe(true);
    expect(t.s.getState(1)).toMatchObject({ status: 'done', title: 'B', text: 'B' });
  });

  it('a subscriber after a restart gets the last summary of the tab', async () => {
    const p = provider(() => chunks('Hello'));
    await setup(p).s.start(1, { force: false });
    const t2 = setup(p);
    const seen: SummaryState[] = [];
    t2.s.subscribe(1, (st) => seen.push(st));
    await vi.waitFor(() => expect(seen.at(-1)).toMatchObject({ status: 'done', text: 'Hello' }));
    expect(p.calls).toBe(1);
  });

  it('restoring never overrides a newer state', async () => {
    const p = provider(() => chunks('Old'));
    await setup(p).s.start(1, { force: false });
    const t2 = setup(provider(() => chunks('New')));
    const seen: SummaryState[] = [];
    t2.s.subscribe(1, (st) => seen.push(st));
    await t2.s.start(1, { force: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(t2.s.getState(1)).toMatchObject({ status: 'done', text: 'New' });
  });

  it('gives a late subscriber the text so far', async () => {
    let signal: AbortSignal | undefined;
    const t = setup(provider((s) => ((signal = s), waitForAbort(s))));
    const running = t.s.start(1, { force: false });
    await vi.waitFor(() => expect(t.s.getState(1)).toMatchObject({ text: 'partial' }));
    const seen: SummaryState[] = [];
    t.s.subscribe(1, (st) => seen.push(st));
    expect(seen[0]).toMatchObject({ status: 'running', text: 'partial' });
    t.s.forget(1);
    await running;
    expect(signal!.aborted).toBe(true);
  });

  it('forget aborts and resets to idle', async () => {
    let signal: AbortSignal | undefined;
    const t = setup(provider((s) => ((signal = s), waitForAbort(s))));
    const running = t.s.start(1, { force: false });
    await vi.waitFor(() => expect(signal).toBeDefined());
    t.s.forget(1);
    await running;
    expect(signal!.aborted).toBe(true);
    expect(t.s.getState(1)).toEqual({ status: 'idle' });
  });
});
