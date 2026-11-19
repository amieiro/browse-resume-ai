import { Readability } from '@mozilla/readability';
import type { Article } from './prompt';

export const MAX_ARTICLE_CHARS = 100_000;
export const MIN_ARTICLE_CHARS = 200;

function normalize(text: string): string {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackText(doc: Document): string {
  const root = doc.querySelector('main') ?? doc.body;
  if (!root) return '';
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript, template, nav, header, footer, aside').forEach((el) => el.remove());
  return normalize(clone.textContent ?? '');
}

/** Extracts the readable article from a page. Returns null when the page has no article text. */
export function extractArticle(doc: Document, url: string): Article | null {
  let title = doc.title.trim();
  let text = '';
  try {
    const parsed = new Readability(doc.cloneNode(true) as Document).parse();
    if (parsed) {
      text = normalize(parsed.textContent ?? '');
      if (parsed.title?.trim()) title = parsed.title.trim();
    }
  } catch {
    text = '';
  }
  if (text.length < MIN_ARTICLE_CHARS) text = fallbackText(doc);
  if (text.length < MIN_ARTICLE_CHARS) return null;

  const truncated = text.length > MAX_ARTICLE_CHARS;
  return { title: title || url, text: truncated ? text.slice(0, MAX_ARTICLE_CHARS) : text, url, truncated };
}
