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
