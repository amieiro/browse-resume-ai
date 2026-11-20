import { browser } from 'wxt/browser';
import type { ReadPdfRequest, ReadPdfResult } from './pdf-messages';
import type { Article } from './prompt';
import { SummaryError } from '@/providers/types';

const READER_PATH = 'pdf-reader.html';
let creating: Promise<void> | null = null;
let reading = 0;

async function ensureReader(): Promise<void> {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType] });
  if (contexts.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({
      url: READER_PATH,
      reasons: ['WORKERS' as Browser.offscreen.Reason],
      justification: 'Reads the text of PDF files with pdf.js, which parses in a Web Worker.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/**
 * Reads a PDF in the offscreen reader. Resolves to null when it has almost no text; throws
 * SummaryError('page_unreadable') when it cannot be downloaded or opened. The reader is closed
 * when no other PDF is being read, to free its memory.
 */
export async function readPdf(url: string, title: string): Promise<Article | null> {
  reading++;
  try {
    await ensureReader();
    const request: ReadPdfRequest = { target: 'pdf-reader', type: 'read-pdf', url, title };
    const result = (await browser.runtime.sendMessage(request)) as ReadPdfResult | undefined;
    if (!result) throw new SummaryError('page_unreadable');
    if (!result.ok) throw new SummaryError(result.code, result.message);
    return result.article;
  } finally {
    if (--reading === 0) await browser.offscreen.closeDocument().catch(() => {});
  }
}
