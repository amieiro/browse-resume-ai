import { browser } from 'wxt/browser';
import type { Article } from './prompt';
import { SummaryError } from '@/providers/types';
import { readPdf as defaultReadPdf } from './pdf';
import type { NoTranscript } from './youtube';

/**
 * Chrome refuses to inject into its own pages and the Web Store, and into any page once the
 * activeTab grant from the last click is gone (the tab navigated elsewhere). Firefox says "Missing
 * host permission for the tab" when there was no click on the add-on for the tab, for example when
 * the summary is asked from the sidebar opened with Firefox's own sidebar button.
 */
export function classifyInjectionError(message: string): 'needs_click' | 'page_unreadable' {
  return /Cannot access contents of|must request permission|Missing host permission/i.test(message) ? 'needs_click' : 'page_unreadable';
}

/**
 * Whether a URL serves a PDF, asked with a HEAD request (with the site's cookies). Firefox shows PDFs
 * in a viewer that extensions cannot inject into, so its PDF tabs are recognised this way.
 */
export async function servesPdf(url: string): Promise<boolean> {
  if (!/^https?:/i.test(url)) return false;
  try {
    const response = await fetch(url, { method: 'HEAD', credentials: 'include' });
    return /^application\/pdf\b/i.test(response.headers.get('content-type') ?? '');
  } catch {
    return false;
  }
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
  // Firefox only: a page it cannot inject into may be its PDF viewer.
  isPdf: ((url: string) => Promise<boolean>) | null = import.meta.env.FIREFOX ? servesPdf : null,
): Promise<Article | null> {
  let results;
  try {
    results = await browser.scripting.executeScript({ target: { tabId }, files: ['/extract.js'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Local files need "Allow access to file URLs", which only the user can turn on (Chrome; Firefox
    // has no such setting).
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab?.url?.startsWith('file:')) throw new SummaryError(import.meta.env.FIREFOX ? 'page_unreadable' : 'file_access', message);
    if (tab?.url && isPdf && (await isPdf(tab.url))) return readPdfOrFail(readPdf, tab.url, tab.title ?? '');
    throw new SummaryError(classifyInjectionError(message), message);
  }
  const result = results?.[0]?.result as Article | PdfMarker | NoTranscript | null | undefined;
  if (result === undefined) throw new SummaryError('page_unreadable');
  if (result && 'noTranscript' in result) throw new SummaryError('no_transcript');
  if (result && 'pdf' in result && result.pdf) return readPdfOrFail(readPdf, result.url, result.title);
  return result as Article | null;
}

async function readPdfOrFail(readPdf: (url: string, title: string) => Promise<Article | null>, url: string, title: string): Promise<Article> {
  const pdf = await readPdf(url, title);
  if (!pdf) throw new SummaryError('pdf_no_text');
  return pdf;
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
