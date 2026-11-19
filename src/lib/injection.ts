import { browser } from 'wxt/browser';
import type { Article } from './prompt';
import { SummaryError } from '@/providers/types';

/**
 * Chrome refuses to inject into its own pages and the Web Store, and into any page once the
 * activeTab grant from the last click is gone (the tab navigated elsewhere).
 */
export function classifyInjectionError(message: string): 'needs_click' | 'page_unreadable' {
  return /Cannot access contents of|must request permission/i.test(message) ? 'needs_click' : 'page_unreadable';
}

/** Runs the extractor in the tab. Returns null when the page has no article text. */
export async function extractFromTab(tabId: number): Promise<Article | null> {
  let results;
  try {
    results = await browser.scripting.executeScript({ target: { tabId }, files: ['/extract.js'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SummaryError(classifyInjectionError(message), message);
  }
  const result = results?.[0]?.result as Article | null | undefined;
  if (result === undefined) throw new SummaryError('page_unreadable');
  return result;
}
