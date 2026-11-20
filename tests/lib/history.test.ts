import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addToHistory,
  clearHistory,
  deleteFromHistory,
  getHistory,
  MAX_HISTORY,
  searchHistory,
  updateHistoryQuestions,
  type HistoryEntry,
} from '@/lib/history';

const base = {
  url: 'https://e.com/a',
  title: 'A title',
  text: 'Summary text',
  truncated: false,
  provider: 'claude' as const,
  model: 'sonnet',
  length: 'medium' as const,
  language: 'gl-ES',
};

beforeEach(() => fakeBrowser.reset());

describe('history storage', () => {
  it('adds entries newest first, with an id and a date', async () => {
    await addToHistory({ ...base, title: 'First' }, 1000);
    const id = await addToHistory({ ...base, title: 'Second' }, 2000);
    const entries = await getHistory();
    expect(entries.map((e) => e.title)).toEqual(['Second', 'First']);
    expect(entries[0]).toMatchObject({ id, createdAt: 2000 });
  });

  it(`keeps the newest ${MAX_HISTORY}`, async () => {
    await fakeBrowser.storage.local.set({
      history: Array.from({ length: MAX_HISTORY }, (_, i) => ({ ...base, id: `old${i}`, createdAt: i })),
    });
    await addToHistory({ ...base, title: 'New' });
    const entries = await getHistory();
    expect(entries).toHaveLength(MAX_HISTORY);
    expect(entries[0]!.title).toBe('New');
    expect(entries.at(-1)!.id).toBe(`old${MAX_HISTORY - 2}`);
  });

  it('keeps every entry when several are added at once', async () => {
    await Promise.all([1, 2, 3].map((n) => addToHistory({ ...base, title: `T${n}` })));
    expect(await getHistory()).toHaveLength(3);
  });

  it('updates the questions of an entry', async () => {
    const id = await addToHistory(base);
    await updateHistoryQuestions(id, [{ question: 'Q?', answer: 'A', status: 'done' }]);
    expect((await getHistory())[0]!.qa).toEqual([{ question: 'Q?', answer: 'A', status: 'done' }]);
  });

  it('deletes one entry, or all of them', async () => {
    const first = await addToHistory(base);
    await addToHistory(base);
    await deleteFromHistory(first);
    expect(await getHistory()).toHaveLength(1);
    await clearHistory();
    expect(await getHistory()).toEqual([]);
  });
});

describe('searchHistory', () => {
  const entries: HistoryEntry[] = [
    { ...base, id: '1', createdAt: 1, title: 'A língua galega', text: 'Fálase en Galicia.' },
    { ...base, id: '2', createdAt: 2, title: 'PHP security', url: 'https://securityweek.com/php', text: 'Critical RCE.' },
    { ...base, id: '3', createdAt: 3, title: 'Other', text: 'x', qa: [{ question: 'Who is Yamamoto?', answer: 'A researcher', status: 'done' }] },
  ];

  it('returns everything for an empty query', () => {
    expect(searchHistory(entries, '  ')).toHaveLength(3);
  });

  it('ignores case and accents', () => {
    expect(searchHistory(entries, 'LINGUA').map((e) => e.id)).toEqual(['1']);
    expect(searchHistory(entries, 'falase galicia').map((e) => e.id)).toEqual(['1']);
  });

  it('needs every word, in the title, URL, summary or questions', () => {
    expect(searchHistory(entries, 'securityweek rce').map((e) => e.id)).toEqual(['2']);
    expect(searchHistory(entries, 'yamamoto').map((e) => e.id)).toEqual(['3']);
    expect(searchHistory(entries, 'php galicia')).toEqual([]);
  });
});
