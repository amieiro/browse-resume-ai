import { browser } from 'wxt/browser';
import type { Article } from './prompt';
import { SummaryError } from '@/providers/types';
import { readPdf as defaultReadPdf } from './pdf';

/**
 * Chrome refuses to inject into its own pages and the Web Store, and into any page once the
 * activeTab grant from the last click is gone (the tab navigated elsewhere).
 */
export function classifyInjectionError(message: string): 'needs_click' | 'page_unreadable' {
  return /Cannot access contents of|must request permission/i.test(message) ? 'needs_click' : 'page_unreadable';
}

/** What the extractor returns for a PDF tab. */
type PdfMarker = { pdf: true; url: string; title: string };

/**
 * Runs the extractor in the tab. Returns null when the page has no article text. For a PDF, the
 * file is read with pdf.js (readPdf), as Chrome's viewer has no text to extract.
 */
export async function extractFromTab(
  tabId: number,
  readPdf: (url: string, title: string) => Promise<Article | null> = defaultReadPdf,
): Promise<Article | null> {
  let results;
  try {
    results = await browser.scripting.executeScript({ target: { tabId }, files: ['/extract.js'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Local files need "Allow access to file URLs", which only the user can turn on.
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab?.url?.startsWith('file:')) throw new SummaryError('file_access', message);
    throw new SummaryError(classifyInjectionError(message), message);
  }
  const result = results?.[0]?.result as Article | PdfMarker | null | undefined;
  if (result === undefined) throw new SummaryError('page_unreadable');
  if (result && 'pdf' in result && result.pdf) {
    const pdf = await readPdf(result.url, result.title);
    if (!pdf) throw new SummaryError('pdf_no_text');
    return pdf;
  }
  return result as Article | null;
}

/**
 * The text selected in a frame of the tab, with its line breaks (the text Chrome passes with a menu
 * click has none). Null when the frame cannot be read (Chrome pages, the PDF viewer).
 */
export async function selectionFromTab(tabId: number, frameId?: number): Promise<string | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
      func: () => globalThis.getSelection?.()?.toString() ?? '',
    });
    const text = results?.[0]?.result;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}
