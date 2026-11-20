import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '@/lib/history';
import { setMessages } from '@/lib/i18n';
import { CLEAR_CONFIRM_MS, mountHistoryView as mountView, type HistoryViewDeps } from '@/ui/history-view';

const mountHistoryView = (r: HTMLElement, e: HistoryEntry[], d: unknown) => mountView(r, e, d as HistoryViewDeps);

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: 'x',
  createdAt: Date.UTC(2026, 10, 20, 10),
  url: 'https://e.com/a',
  title: 'Title',
  text: 'Summary',
  truncated: false,
  provider: 'claude',
  model: 'sonnet',
  length: 'medium',
  language: 'gl-ES',
  ...over,
});

const entries = [
  entry({ id: '1', title: 'Galician language', text: 'Spoken in **Galicia**.' }),
  entry({ id: '2', title: 'PHP security', text: 'RCE', source: 'selection', format: 'pdf', qa: [{ question: 'Who?', answer: 'PHP team', status: 'done' }] }),
];

let root: HTMLElement;
let deps: { onDelete: ReturnType<typeof vi.fn>; onClear: ReturnType<typeof vi.fn>; onCopy: ReturnType<typeof vi.fn> };
const titles = () => [...root.querySelectorAll('.entry h2')].map((h) => h.textContent);
const button = (name: string, scope: ParentNode = root) => scope.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!;

beforeEach(() => {
  setMessages(new Proxy({}, { get: (_t, key) => `[${String(key)}]` }));
  root = document.createElement('div');
  deps = { onDelete: vi.fn(), onClear: vi.fn(), onCopy: vi.fn(async () => {}) };
});

describe('history view', () => {
  it('shows each summary with its link, details, badges and questions', () => {
    mountHistoryView(root, entries, deps);
    expect(titles()).toEqual(['Galician language', 'PHP security']);
    expect(root.querySelector<HTMLAnchorElement>('.entry a')!.href).toBe('https://e.com/a');
    expect(root.querySelector('.entry .summary strong')?.textContent).toBe('Galicia');
    const second = root.querySelectorAll('.entry')[1]!;
    expect(second.querySelector('.meta')?.textContent).toContain('Claude · sonnet');
    expect(second.querySelector('.meta')?.textContent).toContain('[length_medium]');
    expect([...second.querySelectorAll('.badge')].map((b) => b.textContent)).toEqual(['[ui_selection]', 'PDF']);
    expect(second.querySelector('.question')?.textContent).toBe('Who?');
  });

  it('never makes a link of an address that is not web or file', () => {
    mountHistoryView(root, [entry({ url: 'javascript:alert(1)', title: 'Bad' })], deps);
    expect(root.querySelector('.entry a')).toBeNull();
    expect(titles()).toEqual(['Bad']);
  });

  it('filters as you type, and says when nothing matches', () => {
    mountHistoryView(root, entries, deps);
    const search = root.querySelector<HTMLInputElement>('input[name="search"]')!;
    search.value = 'galicia';
    search.dispatchEvent(new Event('input'));
    expect(titles()).toEqual(['Galician language']);
    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input'));
    expect(titles()).toEqual([]);
    expect(root.querySelector('.history-empty')?.textContent).toBe('[history_no_results]');
  });

  it('says when the history is empty, without a Clear button', () => {
    mountHistoryView(root, [], deps);
    expect(root.querySelector('.history-empty')?.textContent).toBe('[history_empty]');
    expect(button('clear').hidden).toBe(true);
  });

  it('copies and deletes one summary', async () => {
    mountHistoryView(root, entries, deps);
    const first = root.querySelector('.entry')!;
    button('copy', first).click();
    expect(deps.onCopy).toHaveBeenCalledWith('Spoken in **Galicia**.');
    button('delete', first).click();
    expect(deps.onDelete).toHaveBeenCalledWith('1');
    expect(titles()).toEqual(['PHP security']);
  });

  it('exports one summary as a note with its details', async () => {
    const exportActions = { copy: vi.fn(async () => {}), download: vi.fn(), open: vi.fn() };
    mountHistoryView(root, entries, { ...deps, exportActions });
    const second = root.querySelectorAll('.entry')[1]!;
    expect(button('export', second).getAttribute('aria-expanded')).toBe('false');
    button('export', second).click();
    expect(button('export', second).getAttribute('aria-expanded')).toBe('true');
    button('export-download', second).click();
    await vi.waitFor(() => expect(exportActions.download).toHaveBeenCalled());
    const [name, note] = exportActions.download.mock.calls[0]!;
    expect(name).toBe('PHP security.md');
    expect(note).toContain('source: "https://e.com/a"');
    expect(note).toContain('created: "2026-11-20T10:00:00.000Z"');
    expect(note).toContain('model: "Claude · sonnet"');
    expect(note).toContain('### Who?\n\nPHP team');
    expect(button('export', second).getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the tokens of each summary and the totals per provider', () => {
    const withUsage = [
      entry({ id: 'a', usage: { ms: 1000, inputTokens: 100, outputTokens: 10 } }),
      entry({ id: 'b', usage: { ms: 2000, inputTokens: 50, outputTokens: 5 } }),
      entry({ id: 'c', provider: 'ollama', model: 'llama3.2' }),
    ];
    mountHistoryView(root, withUsage, deps);
    expect(root.querySelector('.entry .meta')?.textContent).toContain('[ui_usage_tokens] · [ui_usage_time]');
    const totals = root.querySelector<HTMLElement>('.usage-totals')!;
    expect(totals.hidden).toBe(false);
    expect([...totals.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Claude · [history_usage_count] · [ui_usage_tokens]']);
  });

  it('counts the answered questions in the totals and shows what each answer took', () => {
    mountHistoryView(root, [entry({ usage: { ms: 1, inputTokens: 1, outputTokens: 1 }, qa: [{ question: 'Q?', answer: 'A', status: 'done', usage: { ms: 1, inputTokens: 1, outputTokens: 1 } }] })], deps);
    expect(root.querySelector('.usage-totals p')?.textContent).toBe('Claude · [history_usage_count] · [history_usage_questions] · [ui_usage_tokens]');
    expect(root.querySelector('.qa-item .usage')?.textContent).toBe('[ui_usage_tokens] · [ui_usage_time]');
  });

  it('has no totals when no summary has tokens', () => {
    mountHistoryView(root, entries, deps);
    expect(root.querySelector<HTMLElement>('.usage-totals')!.hidden).toBe(true);
  });

  it('clears everything only on a second click', () => {
    vi.useFakeTimers();
    mountHistoryView(root, entries, deps);
    button('clear').click();
    expect(deps.onClear).not.toHaveBeenCalled();
    expect(button('clear').textContent).toBe('[history_clear_confirm]');
    vi.advanceTimersByTime(CLEAR_CONFIRM_MS + 1);
    expect(button('clear').textContent).toBe('[history_clear]');
    button('clear').click();
    button('clear').click();
    expect(deps.onClear).toHaveBeenCalledTimes(1);
    expect(titles()).toEqual([]);
    vi.useRealTimers();
  });
});
