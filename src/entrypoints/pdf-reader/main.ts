// Offscreen document that reads the text of PDF files with pdf.js. It runs here, not in the service
// worker, because pdf.js parses in a Web Worker, which a service worker cannot start.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { browser } from 'wxt/browser';
import { MAX_PDF_BYTES, type ReadPdfRequest, type ReadPdfResult } from '@/lib/pdf-messages';
import { pdfToArticle, type PdfLike } from '@/lib/pdf-text';

GlobalWorkerOptions.workerSrc = workerUrl;

async function readPdf({ url, title }: ReadPdfRequest): Promise<ReadPdfResult> {
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

browser.runtime.onMessage.addListener((msg: ReadPdfRequest, _sender, sendResponse) => {
  if (msg?.target !== 'pdf-reader' || msg.type !== 'read-pdf') return;
  void readPdf(msg).then(sendResponse);
  return true;
});
