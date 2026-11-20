// Turns a summary into a Markdown note: to copy, to save as a .md file or to open in Obsidian.
import type { QaItem } from './summarizer';

export interface ExportInput {
  title: string;
  /** The page the summary is of; left out when unknown. */
  url?: string;
  text: string;
  qa?: QaItem[];
  /** When the summary was made (ms); the note's "created" date. */
  createdAt: number;
  /** What made it, like "Claude · sonnet"; only in the front matter. */
  model?: string;
}

/** Only web and file addresses are written as the source. */
function safeUrl(url: string | undefined): string | null {
  return url && /^(https?|file):/i.test(url) ? url : null;
}

/** A line of text that cannot break the Markdown around it (no line breaks). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The note's body: title, link to the page, the summary, then the answered questions. */
export function summaryMarkdown(input: ExportInput): string {
  const parts: string[] = [];
  const title = oneLine(input.title);
  const url = safeUrl(input.url);
  if (title) parts.push(`# ${title}`);
  if (url) parts.push(`<${url.replace(/[<>\s]/g, encodeURIComponent)}>`);
  parts.push(input.text.trim());
  for (const item of input.qa ?? []) {
    if (item.status !== 'done' || !item.answer.trim()) continue;
    parts.push(`### ${oneLine(item.question)}`, item.answer.trim());
  }
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

/** The same note with YAML front matter (title, source, created), as Obsidian and others read it. */
export function summaryNote(input: ExportInput): string {
  // JSON strings are valid YAML double-quoted scalars.
  const fields: [string, string][] = [['title', oneLine(input.title)]];
  const url = safeUrl(input.url);
  if (url) fields.push(['source', url]);
  fields.push(['created', new Date(input.createdAt).toISOString()]);
  if (input.model) fields.push(['model', input.model]);
  const front = fields.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  return `---\n${front}\n---\n\n${summaryMarkdown(input)}`;
}

/** Longest file name kept, before the extension. */
const MAX_NAME = 100;

/**
 * A file name from the title: without the characters Windows, macOS or Obsidian refuse
 * (\ / : * ? " < > | # ^ [ ]) or control characters, and never empty.
 */
export function fileName(title: string, fallback = 'Summary'): string {
  const name = oneLine(title.replace(/[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g, ' '))
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_NAME)
    .trim();
  return name || fallback;
}

/**
 * The obsidian:// link that creates a note in the vault open last. The text goes through the
 * clipboard (the "clipboard" parameter), so a long note does not make the link too long.
 */
export function obsidianUrl(title: string): string {
  return `obsidian://new?name=${encodeURIComponent(fileName(title))}&clipboard`;
}

export interface ExportActions {
  copy(text: string): Promise<void>;
  /** Saves text as a file in the downloads folder. */
  download(name: string, text: string): void;
  /** Opens an external link (obsidian://). */
  open(url: string): void;
}

/** The browser implementations of the export actions. */
export const browserExport: ExportActions = {
  copy: (text) => navigator.clipboard.writeText(text),
  download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  open(url) {
    Object.assign(document.createElement('a'), { href: url }).click();
  },
};

export type ExportKind = 'markdown' | 'download' | 'obsidian';

/** Runs one export. Obsidian reads the note from the clipboard, so it is copied first. */
export async function exportSummary(kind: ExportKind, input: ExportInput, actions: ExportActions): Promise<void> {
  if (kind === 'markdown') return actions.copy(summaryMarkdown(input));
  if (kind === 'download') return actions.download(`${fileName(input.title)}.md`, summaryNote(input));
  await actions.copy(summaryNote(input));
  actions.open(obsidianUrl(input.title));
}
