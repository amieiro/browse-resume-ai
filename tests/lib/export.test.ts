import { describe, expect, it, vi } from 'vitest';
import { exportSummary, fileName, obsidianUrl, summaryMarkdown, summaryNote, type ExportInput } from '@/lib/export';

const input: ExportInput = {
  title: 'A  page\ntitle',
  url: 'https://example.com/a?b=1',
  text: '- one\n- two\n',
  qa: [
    { question: 'Why?\nReally', answer: 'Because.', status: 'done' },
    { question: 'Pending', answer: 'Half', status: 'running' },
    { question: 'Broken', answer: '', status: 'error', code: 'provider_failed' },
  ],
  createdAt: Date.UTC(2026, 10, 20, 9, 30),
  model: 'Claude · sonnet',
};

describe('summaryMarkdown', () => {
  it('writes the title, the link, the summary and the answered questions', () => {
    expect(summaryMarkdown(input)).toBe(
      '# A page title\n\n<https://example.com/a?b=1>\n\n- one\n- two\n\n### Why? Really\n\nBecause.\n',
    );
  });

  it('leaves out an address that is not a web or file one', () => {
    expect(summaryMarkdown({ ...input, url: 'javascript:alert(1)', qa: [] })).toBe('# A page title\n\n- one\n- two\n');
  });

  it('works without a title, an address or questions', () => {
    expect(summaryMarkdown({ title: '', text: 'Text', createdAt: 0 })).toBe('Text\n');
  });
});

describe('summaryNote', () => {
  it('adds YAML front matter with escaped values', () => {
    const note = summaryNote({ ...input, title: 'Say "hi": a #test', qa: [] });
    expect(note).toBe(
      '---\ntitle: "Say \\"hi\\": a #test"\nsource: "https://example.com/a?b=1"\ncreated: "2026-11-20T09:30:00.000Z"\nmodel: "Claude · sonnet"\n---\n\n' +
        '# Say "hi": a #test\n\n<https://example.com/a?b=1>\n\n- one\n- two\n',
    );
  });

  it('has no source or model when they are unknown', () => {
    const note = summaryNote({ title: 'T', text: 'x', createdAt: 0 });
    expect(note.startsWith('---\ntitle: "T"\ncreated: "1970-01-01T00:00:00.000Z"\n---\n')).toBe(true);
  });
});

describe('fileName', () => {
  it('removes the characters file systems and Obsidian refuse', () => {
    expect(fileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe('a b c d e f g h i j k l m n');
  });

  it('trims dots and spaces at the ends, and cuts long names', () => {
    expect(fileName('  ..Hello..  ')).toBe('Hello');
    expect(fileName('x'.repeat(300))).toHaveLength(100);
  });

  it('never returns an empty name', () => {
    expect(fileName('///')).toBe('Summary');
    expect(fileName('')).toBe('Summary');
  });
});

describe('obsidianUrl', () => {
  it('asks Obsidian for a new note read from the clipboard', () => {
    expect(obsidianUrl('Ciencia & más')).toBe('obsidian://new?name=Ciencia%20%26%20m%C3%A1s&clipboard');
  });
});

describe('exportSummary', () => {
  const actions = () => ({ copy: vi.fn(async () => {}), download: vi.fn(), open: vi.fn() });

  it('copies the Markdown without front matter', async () => {
    const a = actions();
    await exportSummary('markdown', input, a);
    expect(a.copy).toHaveBeenCalledWith(summaryMarkdown(input));
    expect(a.download).not.toHaveBeenCalled();
  });

  it('downloads the note as a .md file named after the title', async () => {
    const a = actions();
    await exportSummary('download', input, a);
    expect(a.download).toHaveBeenCalledWith('A page title.md', summaryNote(input));
  });

  it('copies the note and then opens Obsidian', async () => {
    const a = actions();
    await exportSummary('obsidian', input, a);
    expect(a.copy).toHaveBeenCalledWith(summaryNote(input));
    expect(a.open).toHaveBeenCalledWith('obsidian://new?name=A%20page%20title&clipboard');
    expect(a.copy.mock.invocationCallOrder[0]!).toBeLessThan(a.open.mock.invocationCallOrder[0]!);
  });

  it('does not open Obsidian when the copy fails', async () => {
    const a = actions();
    a.copy.mockRejectedValueOnce(new Error('denied'));
    await expect(exportSummary('obsidian', input, a)).rejects.toThrow('denied');
    expect(a.open).not.toHaveBeenCalled();
  });
});
