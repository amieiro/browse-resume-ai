// Reads the text of a PDF with pdf.js. Runs where Web Workers are available: Chrome's offscreen
// document, or Firefox's background page.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { browser } from 'wxt/browser';
import { MAX_PDF_BYTES, type ReadPdfResult } from './pdf-messages';
import { pdfToArticle, type PdfLike } from './pdf-text';

// Copied next to the other files at build time (see wxt.config.ts).
// (getURL is typed for the entrypoints WXT knows; this file is a public asset.)
GlobalWorkerOptions.workerSrc = (browser.runtime.getURL as (path: string) => string)('/pdf.worker.min.mjs');

export async function readPdfFile(url: string, title: string): Promise<ReadPdfResult> {
  let data: Uint8Array;
  try {
    // The click on the extension (activeTab) lets it fetch the tab's URL, with the site's cookies.
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return { ok: false, code: 'page_unreadable', message: `HTTP ${response.status}` };
    if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) {
      return { ok: false, code: 'page_unreadable', message: 'The PDF is larger than 100 MB.' };
    }
    data = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return { ok: false, code: 'page_unreadable', message: error instanceof Error ? error.message : String(error) };
  }
  try {
    const task = getDocument({ data });
    try {
      const pdf = await task.promise;
      return { ok: true, article: await pdfToArticle(pdf as unknown as PdfLike, url, title) };
    } finally {
      void task.destroy();
    }
  } catch (error) {
    // Password-protected and broken files end here.
    return { ok: false, code: 'pdf_unreadable', message: error instanceof Error ? error.message : String(error) };
  }
}
