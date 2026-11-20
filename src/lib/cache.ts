import { browser } from 'wxt/browser';
import type { Settings } from './settings';
import type { QaItem } from './summarizer';

export interface CachedSummary {
  key: string;
  title: string;
  text: string;
  truncated: boolean;
  /** Set when the summary is of text the reader selected. */
  source?: 'selection';
  /** Questions asked about the summary, with their answers. */
  qa?: QaItem[];
  /** The summary's entry in the history, to add the questions to it. */
  historyId?: string;
}

type KeyInput = Pick<Settings, 'provider' | 'length' | 'language'> & { model: string };

export function cacheKey(url: string, s: KeyInput): string {
  return JSON.stringify([url, s.provider, s.model, s.length, s.language]);
}

const storageKey = (tabId: number) => `summary:${tabId}`;

export async function getCached(tabId: number, key: string): Promise<CachedSummary | null> {
  const result = await browser.storage.session.get(storageKey(tabId));
  const entry = result[storageKey(tabId)] as CachedSummary | undefined;
  return entry && entry.key === key ? entry : null;
}

export async function setCached(tabId: number, entry: CachedSummary): Promise<void> {
  await browser.storage.session.set({ [storageKey(tabId)]: entry });
}

export async function clearCached(tabId: number): Promise<void> {
  await browser.storage.session.remove(storageKey(tabId));
}

/** The tab's last summary, whatever page or settings it was for (used after a service worker restart). */
export async function getLastCached(tabId: number): Promise<CachedSummary | null> {
  const result = await browser.storage.session.get(storageKey(tabId));
  return (result[storageKey(tabId)] as CachedSummary | undefined) ?? null;
}
