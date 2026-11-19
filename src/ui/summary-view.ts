import { t } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';
import { renderMarkdown } from '@/lib/markdown';
import type { ProviderId, Settings, SummaryLength } from '@/lib/settings';
import type { SummaryState } from '@/lib/summarizer';

export interface SummaryViewHandlers {
  onRegenerate(): void;
  onSettingsChange(patch: Partial<Settings>): void;
  onOpenOptions(): void;
}

const PROVIDER_LABELS: Record<ProviderId, string> = { claude: 'Claude', codex: 'Codex' };
const LENGTHS: SummaryLength[] = ['short', 'medium', 'long'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Node[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], value: string) {
  select.replaceChildren(...options.map((o) => el('option', { value: o.value, textContent: o.label })));
  select.value = value;
}

function labelled(label: string, select: HTMLSelectElement) {
  select.setAttribute('aria-label', label);
  select.title = label;
  return select;
}

export function mountSummaryView(root: HTMLElement, initial: Settings, handlers: SummaryViewHandlers) {
  let settings = initial;
  let state: SummaryState = { status: 'idle' };

  const provider = labelled(t('ui_provider'), el('select', { name: 'provider' }));
  const model = labelled(t('ui_model'), el('select', { name: 'model' }));
  const length = labelled(t('ui_length'), el('select', { name: 'length' }));
  const language = labelled(t('ui_language'), el('select', { name: 'language' }));
  const options = el('button', { name: 'options', type: 'button', className: 'icon', textContent: '⚙', title: t('ui_settings') });
  options.setAttribute('aria-label', t('ui_settings'));

  const title = el('h1', { className: 'title' });
  const progress = el('div', { className: 'progress', textContent: t('ui_working') });
  progress.dataset.role = 'progress';
  const hint = el('p', { className: 'hint' });
  const error = el('div', { className: 'error' });
  error.setAttribute('role', 'alert');
  const errorText = el('p', {});
  const errorDetail = el('p', { className: 'detail' });
  errorDetail.dataset.role = 'detail';
  error.append(errorText, errorDetail);
  const summary = el('div', { className: 'summary' });
  summary.dataset.role = 'summary';
  summary.setAttribute('aria-live', 'polite');
  const notice = el('p', { className: 'notice', textContent: t('ui_truncated') });
  const copy = el('button', { name: 'copy', type: 'button', textContent: t('ui_copy') });
  const regenerate = el('button', { name: 'regenerate', type: 'button', className: 'primary' });

  root.replaceChildren(
    el('header', { className: 'toolbar' }, provider, model, length, language, options),
    el('main', {}, title, progress, hint, error, summary, notice),
    el('footer', { className: 'actions' }, copy, regenerate),
  );

  function renderSelectors() {
    fillSelect(provider, (Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => ({ value: id, label: PROVIDER_LABELS[id] })), settings.provider);
    const list = settings.modelLists[settings.provider];
    fillSelect(model, list.map((m) => ({ value: m, label: m })), settings.models[settings.provider]);
    fillSelect(length, LENGTHS.map((l) => ({ value: l, label: t(`length_${l}`) })), settings.length);
    fillSelect(language, LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName })), settings.language);
  }

  function renderState() {
    const s = state;
    const hasContent = s.status !== 'idle';
    title.textContent = hasContent ? s.title : '';
    title.hidden = !title.textContent;
    hint.hidden = s.status !== 'idle';
    hint.textContent = t('ui_idle_hint');
    progress.hidden = !(s.status === 'running' && !s.text);
    error.hidden = s.status !== 'error';
    errorText.textContent = s.status === 'error' ? t(`error_${s.code}`) : '';
    errorDetail.textContent = s.status === 'error' ? (s.detail ?? '') : '';
    errorDetail.hidden = !errorDetail.textContent;
    if (hasContent) renderMarkdown(s.text, summary);
    else summary.replaceChildren();
    notice.hidden = !(hasContent && s.truncated && s.text);
    copy.disabled = s.status !== 'done';
    regenerate.textContent = s.status === 'error' ? t('ui_try_again') : t('ui_regenerate');
    regenerate.hidden = s.status === 'idle' || (s.status === 'error' && s.code === 'needs_click');
    regenerate.disabled = s.status === 'running';
  }

  provider.addEventListener('change', () => {
    settings = { ...settings, provider: provider.value as ProviderId };
    renderSelectors();
    handlers.onSettingsChange({ provider: settings.provider });
  });
  model.addEventListener('change', () => {
    settings = { ...settings, models: { ...settings.models, [settings.provider]: model.value } };
    handlers.onSettingsChange({ models: settings.models });
  });
  length.addEventListener('change', () => {
    settings = { ...settings, length: length.value as SummaryLength };
    handlers.onSettingsChange({ length: settings.length });
  });
  language.addEventListener('change', () => {
    settings = { ...settings, language: language.value };
    handlers.onSettingsChange({ language: settings.language });
  });
  options.addEventListener('click', () => handlers.onOpenOptions());
  regenerate.addEventListener('click', () => handlers.onRegenerate());
  copy.addEventListener('click', () => {
    if (state.status !== 'done') return;
    void navigator.clipboard.writeText(state.text).then(() => {
      copy.textContent = t('ui_copied');
      setTimeout(() => (copy.textContent = t('ui_copy')), 1500);
    });
  });

  renderSelectors();
  renderState();

  return {
    setState(next: SummaryState) {
      state = next;
      renderState();
    },
    setSettings(next: Settings) {
      settings = next;
      renderSelectors();
    },
  };
}
