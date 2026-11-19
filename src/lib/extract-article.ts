import { Readability } from '@mozilla/readability';
import type { Article } from './prompt';

export const MAX_ARTICLE_CHARS = 100_000;
export const MIN_ARTICLE_CHARS = 500;
/** A page counts as an article only with at least this many prose sentences. */
const MIN_SENTENCES = 3;
const MIN_SENTENCE_WORDS = 6;

const NOT_CONTENT = [
  'script', 'style', 'noscript', 'template', 'nav', 'header', 'footer', 'aside',
  'form', 'button', 'input', 'select', 'textarea', 'label', 'dialog',
  '[hidden]', '[aria-hidden="true"]', '[style*="display:none"]', '[style*="display: none"]',
  '[role="navigation"]', '[role="dialog"]', '[role="banner"]', '[role="contentinfo"]',
  '[role="menu"]', '[role="menubar"]', '[role="toolbar"]',
].join(', ');

function normalize(text: string): string {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, div, section, article, blockquote, pre, tr, br, dd, dt, figcaption';

/** textContent with a line break after each block, so paragraphs do not run together. */
function blockText(root: Element): string {
  root.querySelectorAll(BLOCKS).forEach((el) => el.after(el.ownerDocument.createTextNode('\n')));
  return normalize(root.textContent ?? '');
}

function fallbackText(doc: Document): string {
  const root = doc.querySelector('main') ?? doc.body;
  if (!root) return '';
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(NOT_CONTENT).forEach((el) => el.remove());
  return blockText(clone);
}

/** Menus, tables of labels and login forms have text but few real sentences. */
function looksLikeProse(text: string): boolean {
  // Linear split (a backtracking regex over 100,000 characters without punctuation takes seconds).
  const segments = text.slice(0, 20_000).split(/(?<=[.!?…])\s+/);
  let count = 0;
  for (const segment of segments) {
    const last = segment.split('\n').pop()!.trim();
    if (/[.!?…]$/.test(last) && last.split(/\s+/).length >= MIN_SENTENCE_WORDS && ++count >= MIN_SENTENCES) return true;
  }
  return false;
}

/** Extracts the readable article from a page. Returns null when the page has no article text. */
export function extractArticle(doc: Document, url: string): Article | null {
  let title = doc.title.trim();
  let text = '';
  try {
    const parsed = new Readability(doc.cloneNode(true) as Document).parse();
    if (parsed) {
      // Parse Readability's article HTML into an inert document: nothing loads or runs.
      const inert = new DOMParser().parseFromString(parsed.content ?? '', 'text/html');
      text = blockText(inert.body);
      if (parsed.title?.trim()) title = parsed.title.trim();
    }
  } catch {
    text = '';
  }
  const isArticle = (t: string) => t.length >= MIN_ARTICLE_CHARS && looksLikeProse(t);
  if (!isArticle(text)) text = fallbackText(doc);
  if (!isArticle(text)) return null;

  const truncated = text.length > MAX_ARTICLE_CHARS;
  return { title: title || url, text: truncated ? text.slice(0, MAX_ARTICLE_CHARS) : text, url, truncated };
}
