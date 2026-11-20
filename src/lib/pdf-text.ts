import { MAX_ARTICLE_CHARS, type Article } from './prompt';

/** A PDF opened with pdf.js, reduced to what the text reader uses (so tests can pass a fake). */
export interface PdfLike {
  numPages: number;
  getMetadata(): Promise<{ info?: unknown }>;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

/** Below this, a PDF is taken as scanned images or a form, with nothing to summarize. */
export const MIN_PDF_CHARS = 200;

function pageText(items: unknown[]): string {
  let text = '';
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue;
    const { str, hasEOL } = item as { str: string; hasEOL?: boolean };
    text += str;
    if (hasEOL) text += '\n';
  }
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The document's own title, unless it is empty or an obvious file or tool name. */
function metadataTitle(info: unknown): string {
  const title = info && typeof info === 'object' && 'Title' in info ? String((info as { Title: unknown }).Title ?? '').trim() : '';
  if (!title || /^untitled$/i.test(title) || /\.(pdf|docx?|pptx?|tex)$/i.test(title)) return '';
  return title;
}

/**
 * The text of a PDF, page by page with a blank line between pages, up to the length a summary
 * reads. Returns null for a PDF with almost no text (scanned pages, forms).
 */
export async function pdfToArticle(pdf: PdfLike, url: string, fallbackTitle: string): Promise<Article | null> {
  const pages: string[] = [];
  let length = 0;
  let truncated = false;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (length > MAX_ARTICLE_CHARS) {
      truncated = true;
      break;
    }
    const page = await pdf.getPage(n);
    const text = pageText((await page.getTextContent()).items);
    if (text) {
      pages.push(text);
      length += text.length + 2;
    }
  }
  let text = pages.join('\n\n');
  if (text.length < MIN_PDF_CHARS) return null;
  if (text.length > MAX_ARTICLE_CHARS) {
    text = text.slice(0, MAX_ARTICLE_CHARS);
    truncated = true;
  }
  const { info } = await pdf.getMetadata().catch(() => ({ info: undefined }));
  const title = metadataTitle(info) || fallbackTitle.trim() || decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() || url);
  return { title, text, url, truncated, format: 'pdf' };
}
