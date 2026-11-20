import { t } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';
import type { DisplayMode, ProviderId, Settings, SummaryLength } from '@/lib/settings';
import type { Availability } from '@/providers/types';

export interface OptionsViewDeps {
  onSave(patch: Partial<Settings>): void;
  checkAvailability(id: ProviderId): Promise<Availability>;
  /** The extension version, shown at the bottom of the page. */
  version?: string;
}

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'claude', label: 'Claude (Claude Code)' },
  { id: 'codex', label: 'Codex (ChatGPT)' },
];

export function parseModelList(text: string): string[] {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

function select(name: string, options: { value: string; label: string }[], value: string) {
  const s = el('select', { name, id: name });
  s.append(...options.map((o) => el('option', { value: o.value, textContent: o.label })));
  s.value = value;
  return s;
}

function row(label: string, control: HTMLElement) {
  return el('div', { className: 'row' }, el('label', { htmlFor: control.id, textContent: label }), control);
}

export function mountOptionsView(root: HTMLElement, initial: Settings, deps: OptionsViewDeps) {
  let settings = initial;

  const displayMode = select(
    'displayMode',
    [
      { value: 'sidepanel', label: t('options_mode_sidepanel') },
      { value: 'popup', label: t('options_mode_popup') },
    ],
    settings.displayMode,
  );
  const provider = select('provider', PROVIDERS.map((p) => ({ value: p.id, label: p.label })), settings.provider);
  const length = select(
    'length',
    (['short', 'medium', 'long'] as SummaryLength[]).map((l) => ({ value: l, label: t(`length_${l}`) })),
    settings.length,
  );
  const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName }));
  const language = select('language', languageOptions, settings.language);
  const uiLanguage = select(
    'uiLanguage',
    [{ value: 'auto', label: t('options_ui_language_auto') }, ...languageOptions],
    settings.uiLanguage,
  );

  displayMode.addEventListener('change', () => deps.onSave({ displayMode: displayMode.value as DisplayMode }));
  provider.addEventListener('change', () => deps.onSave({ provider: provider.value as ProviderId }));
  length.addEventListener('change', () => deps.onSave({ length: length.value as SummaryLength }));
  language.addEventListener('change', () => deps.onSave({ language: language.value }));
  uiLanguage.addEventListener('change', () => deps.onSave({ uiLanguage: uiLanguage.value }));

  const statusChecks: Promise<void>[] = [];
  const providerSections = PROVIDERS.map(({ id, label }) => {
    const modelSelect = el('select', { name: `model-${id}`, id: `model-${id}` });
    const fillModels = () => {
      modelSelect.replaceChildren(...settings.modelLists[id].map((m) => el('option', { value: m, textContent: m })));
      modelSelect.value = settings.models[id];
    };
    fillModels();

    const list = el('textarea', { name: `models-${id}`, id: `models-${id}`, rows: 4, spellcheck: false });
    list.value = settings.modelLists[id].join('\n');
    const listError = el('p', { className: 'field-error', hidden: true, textContent: t('options_models_empty') });

    modelSelect.addEventListener('change', () => {
      settings = { ...settings, models: { ...settings.models, [id]: modelSelect.value } };
      deps.onSave({ models: settings.models });
    });
    list.addEventListener('change', () => {
      const models = parseModelList(list.value);
      if (models.length === 0) {
        list.value = settings.modelLists[id].join('\n');
        listError.hidden = false;
        return;
      }
      listError.hidden = true;
      list.value = models.join('\n');
      const modelLists = { ...settings.modelLists, [id]: models };
      const patch: Partial<Settings> = { modelLists };
      settings = { ...settings, modelLists };
      if (!models.includes(settings.models[id])) {
        settings = { ...settings, models: { ...settings.models, [id]: models[0]! } };
        patch.models = settings.models;
      }
      fillModels();
      deps.onSave(patch);
    });

    const status = el('p', { className: 'status', textContent: '…' });
    status.dataset.status = id;
    statusChecks.push(
      deps.checkAvailability(id).then((a) => {
        status.textContent = a.ok ? t('options_ready') : t(`error_${a.code}`);
        status.classList.toggle('ok', a.ok);
      }),
    );

    return el(
      'fieldset',
      {},
      el('legend', { textContent: label }),
      status,
      row(t('ui_model'), modelSelect),
      row(t('options_model_list'), list),
      listError,
    );
  });

  root.replaceChildren(
    el('h1', { textContent: t('options_title') }),
    el(
      'fieldset',
      {},
      el('legend', { textContent: t('options_defaults') }),
      row(t('options_ui_language'), uiLanguage),
      row(t('options_display_mode'), displayMode),
      row(t('ui_provider'), provider),
      row(t('ui_length'), length),
      row(t('ui_language'), language),
    ),
    ...providerSections,
    el('p', { className: 'help', textContent: t('options_help') }),
  );
  if (deps.version) root.append(el('p', { className: 'version', textContent: `v${deps.version}` }));

  return { ready: Promise.all(statusChecks).then(() => undefined) };
}
