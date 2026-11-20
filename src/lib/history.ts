import { browser } from 'wxt/browser';
import type { ProviderId, SummaryLength } from './settings';
import type { QaItem } from './summarizer';

/** A summary kept in the history, with what it was made with. */
export interface HistoryEntry {
  id: string;
  createdAt: number;
  url: string;
  title: string;
  text: string;
  truncated: boolean;
  source?: 'selection';
  format?: 'pdf' | 'video' | 'thread';
  provider: ProviderId;
  model: string;
  length: SummaryLength;
  language: string;
  qa?: QaItem[];
}

export const HISTORY_KEY = 'history';
/** Oldest entries go first beyond this; about 1–3 KB each, well within storage.local. */
export const MAX_HISTORY = 500;

// Every change is a read-modify-write of one array; changes from this context run one at a time.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Newest first. */
export async function getHistory(): Promise<HistoryEntry[]> {
  const result = await browser.storage.local.get(HISTORY_KEY);
  const entries = result[HISTORY_KEY];
  return Array.isArray(entries) ? (entries as HistoryEntry[]) : [];
}

async function save(entries: HistoryEntry[]): Promise<void> {
  await browser.storage.local.set({ [HISTORY_KEY]: entries.slice(0, MAX_HISTORY) });
}

/** Adds a summary at the top and returns its id. */
export function addToHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>, now = Date.now()): Promise<string> {
  return serial(async () => {
    const id = crypto.randomUUID();
    await save([{ ...entry, id, createdAt: now }, ...(await getHistory())]);
    return id;
  });
}

/** Replaces the questions and answers of an entry, if it is still there. */
export function updateHistoryQuestions(id: string, qa: QaItem[]): Promise<void> {
  return serial(async () => {
    const entries = await getHistory();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    entries[index] = { ...entries[index]!, qa };
    await save(entries);
  });
}

export function deleteFromHistory(id: string): Promise<void> {
  return serial(async () => save((await getHistory()).filter((e) => e.id !== id)));
}

export function clearHistory(): Promise<void> {
  return serial(async () => browser.storage.local.remove(HISTORY_KEY));
}

/** Lower case, without accents, so "galego" finds "Galégo" and "resumen" finds "Resúmen". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The entries that contain every word of the query in their title, URL, summary or questions. */
export function searchHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = fold(
      [entry.title, entry.url, entry.text, ...(entry.qa ?? []).flatMap((item) => [item.question, item.answer])].join('\n'),
    );
    return words.every((word) => haystack.includes(word));
  });
}
