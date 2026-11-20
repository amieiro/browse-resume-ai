import type { HistoryEntry } from '@/lib/history';
import { t } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';
import { renderMarkdown } from '@/lib/markdown';
import { searchHistory } from '@/lib/history';

export interface HistoryViewDeps {
  onDelete(id: string): void;
  onClear(): void;
  onCopy(text: string): Promise<void>;
}

/** How long the Clear history button waits for the second click that confirms it. */
export const CLEAR_CONFIRM_MS = 5000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

const PROVIDER_LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', ollama: 'Ollama' };

/** Only web and file addresses become links; anything else (javascript:, data:) stays text. */
function safeUrl(url: string): string | null {
  return /^(https?|file):/i.test(url) ? url : null;
}

export function mountHistoryView(root: HTMLElement, initial: HistoryEntry[], deps: HistoryViewDeps) {
  let entries = initial;
  const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.nativeName ?? code;

  const search = el('input', { type: 'search', name: 'search', placeholder: t('history_search') });
  search.setAttribute('aria-label', t('history_search'));
  const clear = el('button', { type: 'button', name: 'clear', textContent: t('history_clear') });
  const list = el('div', { className: 'history-list' });
  const empty = el('p', { className: 'history-empty' });
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  root.replaceChildren(
    el('header', { className: 'history-header' }, el('h1', { textContent: t('history_title') }), clear),
    search,
    empty,
    list,
  );

  function renderEntry(entry: HistoryEntry) {
    const href = safeUrl(entry.url);
    const title = href
      ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: entry.title || entry.url })
      : el('span', { textContent: entry.title || entry.url });
    const badges = [
      ...(entry.source === 'selection' ? [el('span', { className: 'badge', textContent: t('ui_selection') })] : []),
      ...(entry.format === 'pdf' ? [el('span', { className: 'badge', textContent: 'PDF' })] : []),
    ];
    const meta = el(
      'p',
      { className: 'meta' },
      [dateFormat.format(entry.createdAt), `${PROVIDER_LABELS[entry.provider] ?? entry.provider} · ${entry.model}`, t(`length_${entry.length}`), languageName(entry.language)].join(' · '),
      ...badges.flatMap((b) => [' ', b]),
    );
    const summary = el('div', { className: 'summary' });
    renderMarkdown(entry.text, summary);
    const qa = (entry.qa ?? [])
      .filter((item) => item.status === 'done')
      .map((item) => {
        const answer = el('div', { className: 'answer' });
        renderMarkdown(item.answer, answer);
        return el('div', { className: 'qa-item' }, el('p', { className: 'question', textContent: item.question }), answer);
      });
    const copy = el('button', { type: 'button', name: 'copy', textContent: t('ui_copy') });
    copy.addEventListener('click', () => {
      void deps.onCopy(entry.text).then(() => {
        copy.textContent = t('ui_copied');
        setTimeout(() => (copy.textContent = t('ui_copy')), 1500);
      });
    });
    const remove = el('button', { type: 'button', name: 'delete', textContent: t('history_delete') });
    remove.addEventListener('click', () => {
      entries = entries.filter((e) => e.id !== entry.id);
      deps.onDelete(entry.id);
      render();
    });
    const item = el('article', { className: 'entry' }, el('h2', {}, title), meta, summary, ...qa, el('div', { className: 'entry-actions' }, copy, remove));
    item.dataset.id = entry.id;
    return item;
  }

  function render() {
    const shown = searchHistory(entries, search.value);
    list.replaceChildren(...shown.map(renderEntry));
    empty.textContent = entries.length === 0 ? t('history_empty') : shown.length === 0 ? t('history_no_results') : '';
    empty.hidden = !empty.textContent;
    clear.hidden = entries.length === 0;
  }

  search.addEventListener('input', render);
  clear.addEventListener('click', () => {
    // Two clicks: the first one asks, the second one (within a few seconds) clears.
    if (!confirmTimer) {
      clear.textContent = t('history_clear_confirm');
      clear.classList.add('danger');
      confirmTimer = setTimeout(() => {
        confirmTimer = undefined;
        clear.textContent = t('history_clear');
        clear.classList.remove('danger');
      }, CLEAR_CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    clear.textContent = t('history_clear');
    clear.classList.remove('danger');
    entries = [];
    deps.onClear();
    render();
  });

  render();
  return {
    setEntries(next: HistoryEntry[]) {
      entries = next;
      render();
    },
  };
}
