import { describe, expect, it, vi } from 'vitest';
import { classifyInjectionError } from '@/lib/injection';

describe('classifyInjectionError', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'Cannot access a chrome-extension:// URL of different extension',
    'The extensions gallery cannot be scripted.',
    'Frame with ID 0 is showing error page',
    'No tab with id: 5.',
  ])('treats %j as an unreadable page', (message) => {
    expect(classifyInjectionError(message)).toBe('page_unreadable');
  });

  it('asks for a new click when the activeTab grant is gone', () => {
    expect(
      classifyInjectionError(
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      ),
    ).toBe('needs_click');
  });
});

describe('extractFromTab', () => {
  const article = { title: 'T', text: 'x', url: 'https://e.com/a.pdf', truncated: false, format: 'pdf' as const };

  it('reads a PDF tab with the PDF reader, with its URL and title', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { extractFromTab } = await import('@/lib/injection');
    (fakeBrowser.scripting as any).executeScript = vi.fn(async () => [{ result: { pdf: true, url: 'https://e.com/a.pdf', title: 'a.pdf' } }]);
    const readPdf = vi.fn(async () => article);
    expect(await extractFromTab(1, readPdf)).toBe(article);
    expect(readPdf).toHaveBeenCalledWith('https://e.com/a.pdf', 'a.pdf');
  });

  it('returns the article of a web page without the PDF reader', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { extractFromTab } = await import('@/lib/injection');
    const page = { ...article, url: 'https://e.com/a', format: undefined };
    (fakeBrowser.scripting as any).executeScript = vi.fn(async () => [{ result: page }]);
    const readPdf = vi.fn();
    expect(await extractFromTab(1, readPdf)).toEqual(page);
    expect(readPdf).not.toHaveBeenCalled();
  });
});

describe('extractFromTab errors', () => {
  it('asks to allow file access when a local file cannot be read', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { extractFromTab } = await import('@/lib/injection');
    (fakeBrowser.scripting as any).executeScript = vi.fn(async () => {
      throw new Error('Cannot access contents of url "file:///Users/x/a.pdf". Extension manifest must request permission to access this host.');
    });
    (fakeBrowser.tabs as any).get = vi.fn(async () => ({ id: 1, url: 'file:///Users/x/a.pdf' }));
    await expect(extractFromTab(1, vi.fn())).rejects.toMatchObject({ code: 'file_access' });
  });

  it('says a PDF has no text when the reader finds none', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { extractFromTab } = await import('@/lib/injection');
    (fakeBrowser.scripting as any).executeScript = vi.fn(async () => [{ result: { pdf: true, url: 'https://e.com/scan.pdf', title: 'scan.pdf' } }]);
    await expect(extractFromTab(1, vi.fn(async () => null))).rejects.toMatchObject({ code: 'pdf_no_text' });
  });
});

describe('extractFromTab on YouTube', () => {
  it('says a video has no transcript', async () => {
    const { fakeBrowser } = await import('wxt/testing/fake-browser');
    const { extractFromTab } = await import('@/lib/injection');
    (fakeBrowser.scripting as any).executeScript = vi.fn(async () => [{ result: { noTranscript: true } }]);
    await expect(extractFromTab(1, vi.fn())).rejects.toMatchObject({ code: 'no_transcript' });
  });
});
