// Offscreen document (Chrome) that reads the text of PDF files with pdf.js. It runs here, not in the
// service worker, because pdf.js parses in a Web Worker, which a service worker cannot start.
import { browser } from 'wxt/browser';
import type { ReadPdfRequest } from '@/lib/pdf-messages';
import { readPdfFile } from '@/lib/pdf-read';

browser.runtime.onMessage.addListener((msg: ReadPdfRequest, _sender, sendResponse) => {
  if (msg?.target !== 'pdf-reader' || msg.type !== 'read-pdf') return;
  void readPdfFile(msg.url, msg.title).then(sendResponse);
  return true;
});
