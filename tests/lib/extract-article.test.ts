import { describe, expect, it } from 'vitest';
import { extractArticle, MAX_ARTICLE_CHARS } from '@/lib/extract-article';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');
const paragraphs = Array.from({ length: 5 }, (_, i) => `<p>${words(100, `p${i}w`)}.</p>`).join('');
const articlePage = `<html><head><title>Page title</title></head><body>
  <nav><a href="/">Home</a><a href="/login">NavLoginLabel</a></nav>
  <article><h1>Real headline</h1>${paragraphs}</article>
  <footer>FooterCopyright</footer></body></html>`;

describe('extractArticle', () => {
  it('returns the article text without the page chrome', () => {
    const a = extractArticle(doc(articlePage), 'https://e.com/a');
    expect(a).not.toBeNull();
    expect(a!.text).toContain('p0w0');
    expect(a!.text).toContain('p4w99');
    expect(a!.text).not.toContain('NavLoginLabel');
    expect(a!.title).toMatch(/Real headline|Page title/);
    expect(a!.url).toBe('https://e.com/a');
    expect(a!.truncated).toBe(false);
  });

  it('does not mutate the original document', () => {
    const d = doc(articlePage);
    extractArticle(d, 'https://e.com/a');
    expect(d.querySelector('nav')).not.toBeNull();
  });

  it('falls back to <main> when Readability finds nothing', () => {
    const d = doc(`<body><main><div>${'Short line here. '.repeat(25)}</div></main></body>`);
    const a = extractArticle(d, 'https://e.com/m');
    expect(a).not.toBeNull();
    expect(a!.text).toContain('Short line here.');
  });

  it('cuts long text at the cap and marks it truncated', () => {
    const long = Array.from({ length: 300 }, (_, i) => `<p>${'lorem ipsum dolor sit amet '.repeat(20)}${i}</p>`).join('');
    const a = extractArticle(doc(`<body><article>${long}</article></body>`), 'https://e.com/l');
    expect(a!.text.length).toBe(MAX_ARTICLE_CHARS);
    expect(a!.truncated).toBe(true);
  });

  it('returns null for a web app shell with no article text', () => {
    expect(extractArticle(doc('<body><nav>Home Login Pricing</nav><div id="app"></div></body>'), 'https://e.com/app')).toBeNull();
  });

  it('returns null for a whitespace-only body', () => {
    expect(extractArticle(doc('<body>   \n  </body>'), 'https://e.com/w')).toBeNull();
  });
});
