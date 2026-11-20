// @vitest-environment node
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { pdfToArticle, type PdfLike } from '@/lib/pdf-text';
import { buildPrompt, MAX_ARTICLE_CHARS } from '@/lib/prompt';

// The fixture as a data URL (Vite's ?inline), so the test needs no Node file APIs.
const fixtures = import.meta.glob<string>('../fixtures/galician.pdf', { query: '?inline', import: 'default', eager: true });
const fixtureBytes = () => Uint8Array.from(atob(Object.values(fixtures)[0]!.split(',')[1]!), (c) => c.charCodeAt(0));

function fake(pages: string[][], info: unknown = {}): PdfLike {
  return {
    numPages: pages.length,
    getMetadata: async () => ({ info }),
    getPage: async (n) => ({
      getTextContent: async () => ({ items: pages[n - 1]!.map((str) => ({ str, hasEOL: true })) }),
    }),
  };
}

const line = (n: number) => `Sentence number ${n} of a document that has enough words in it.`;

describe('pdfToArticle', () => {
  it('reads a real PDF with pdf.js: the text of every page and the title in its metadata', async () => {
    const pdf = await getDocument({ data: fixtureBytes() }).promise;
    const article = await pdfToArticle(pdf as unknown as PdfLike, 'https://e.com/galician.pdf', 'galician.pdf');
    expect(article!.title).toBe('The Galician language');
    expect(article!.text).toContain('Galician is a Western Ibero-Romance language spoken in Galicia.');
    expect(article!.text).toContain('co-official in Galicia');
    expect(article!.text.indexOf('Galicia.')).toBeLessThan(article!.text.indexOf('standardised'));
    expect(article!.format).toBe('pdf');
    expect(article!.truncated).toBe(false);
  });

  it('puts a blank line between pages', async () => {
    const article = await pdfToArticle(fake([[line(1), line(2)], [line(3), line(4)]]), 'https://e.com/a.pdf', 'a.pdf');
    expect(article!.text).toBe(`${line(1)}\n${line(2)}\n\n${line(3)}\n${line(4)}`);
  });

  it('returns null for a PDF with almost no text (scanned pages)', async () => {
    expect(await pdfToArticle(fake([[''], ['Page 2']]), 'https://e.com/scan.pdf', 'scan.pdf')).toBeNull();
  });

  it('stops reading pages once the text is long enough, and marks it truncated', async () => {
    const page = Array.from({ length: 400 }, (_, i) => line(i));
    let read = 0;
    const pdf = fake(Array.from({ length: 50 }, () => page));
    const getPage = pdf.getPage.bind(pdf);
    pdf.getPage = (n) => ((read = n), getPage(n));
    const article = await pdfToArticle(pdf, 'https://e.com/book.pdf', 'book.pdf');
    expect(article!.truncated).toBe(true);
    expect(article!.text.length).toBeLessThanOrEqual(MAX_ARTICLE_CHARS);
    expect(read).toBeLessThan(50);
  });

  it.each([
    [{ Title: 'Annual report 2026' }, 'Tab title', 'Annual report 2026'],
    [{ Title: '' }, 'Tab title', 'Tab title'],
    [{ Title: 'draft-v3.docx' }, 'Tab title', 'Tab title'],
    [{}, '', 'my%20file.pdf'.replace('%20', ' ')],
  ])('picks the title from %j, the tab title %j', async (info, tabTitle, expected) => {
    const article = await pdfToArticle(fake([[line(1), line(2), line(3), line(4)]], info), 'https://e.com/docs/my%20file.pdf?x=1', tabTitle);
    expect(article!.title).toBe(expected);
  });

  it('makes the prompt call it a PDF document', async () => {
    const article = await pdfToArticle(fake([[line(1), line(2), line(3), line(4)]]), 'https://e.com/a.pdf', 'a');
    expect(buildPrompt(article!, 'short', 'en-US')).toContain('Summarize the PDF document below.');
  });
});
