import { t } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';
import { MAX_STYLE_INSTRUCTION, STANDARD_STYLE, styleOptions, type CustomStyle } from '@/lib/styles';
import type { DisplayMode, ProviderId, Settings, SummaryLength } from '@/lib/settings';
import type { Availability } from '@/providers/types';

export interface OptionsViewDeps {
  onSave(patch: Partial<Settings>): void;
  checkAvailability(id: ProviderId): Promise<Availability>;
  /** The extension version, shown at the bottom of the page. */
  version?: string;
  /** The detected models of a provider (or its fallback list), before the ones added by hand. */
  baseModels?(id: ProviderId): string[];
  /** When the model lists were last read from the providers; null if never. */
  modelsCheckedAt?: number | null;
  /** Reads the model lists again now. */
  onRefreshModels?(): Promise<void>;
  onOpenHistory?(): void;
}

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'claude', label: 'Claude (Claude Code)' },
  { id: 'codex', label: 'Codex (ChatGPT)' },
  { id: 'ollama', label: 'Ollama (local models)' },
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

  const style = el('select', { name: 'style', id: 'style' });
  const fillStyles = () => {
    style.replaceChildren(...styleOptions(settings.customStyles, t).map((o) => el('option', { value: o.value, textContent: o.label })));
    style.value = settings.style;
  };
  fillStyles();
  style.addEventListener('change', () => {
    settings = { ...settings, style: style.value };
    deps.onSave({ style: settings.style });
  });

  // Custom styles: a name and an instruction each, saved as they are edited.
  const styleList = el('div', { className: 'styles' });
  const saveStyles = (customStyles: CustomStyle[]) => {
    const patch: Partial<Settings> = { customStyles };
    settings = { ...settings, customStyles };
    if (settings.style !== STANDARD_STYLE && !customStyles.some((s) => s.id === settings.style) && !style.querySelector(`option[value="${settings.style}"]`)) {
      settings = { ...settings, style: STANDARD_STYLE };
      patch.style = STANDARD_STYLE;
    }
    deps.onSave(patch);
    fillStyles();
  };
  const renderStyles = () => {
    styleList.replaceChildren(
      ...settings.customStyles.map((custom, index) => {
        const name = el('input', { type: 'text', name: `style-name-${index}`, value: custom.name, placeholder: t('options_style_name') });
        name.setAttribute('aria-label', t('options_style_name'));
        const instruction = el('textarea', { name: `style-instruction-${index}`, rows: 2, maxLength: MAX_STYLE_INSTRUCTION, value: custom.instruction, placeholder: t('options_style_instruction') });
        instruction.setAttribute('aria-label', t('options_style_instruction'));
        const update = () =>
          saveStyles(settings.customStyles.map((s) => (s.id === custom.id ? { ...s, name: name.value.trim(), instruction: instruction.value.trim() } : s)));
        name.addEventListener('change', update);
        instruction.addEventListener('change', update);
        const remove = el('button', { type: 'button', name: `style-delete-${index}`, textContent: t('history_delete') });
        remove.addEventListener('click', () => {
          const remaining = settings.customStyles.filter((s) => s.id !== custom.id);
          if (settings.style === custom.id) {
            settings = { ...settings, style: STANDARD_STYLE };
            deps.onSave({ style: STANDARD_STYLE });
          }
          saveStyles(remaining);
          renderStyles();
        });
        return el('div', { className: 'custom-style' }, el('div', { className: 'custom-style-head' }, name, remove), instruction);
      }),
    );
  };
  renderStyles();
  const addStyle = el('button', { type: 'button', name: 'style-add', textContent: t('options_style_add') });
  addStyle.addEventListener('click', () => {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    settings = { ...settings, customStyles: [...settings.customStyles, { id, name: '', instruction: '' }] };
    renderStyles();
    styleList.querySelector<HTMLInputElement>(`input[name="style-name-${settings.customStyles.length - 1}"]`)?.focus();
  });

  const keepHistory = el('input', { type: 'checkbox', name: 'keepHistory', id: 'keepHistory', checked: settings.keepHistory });
  keepHistory.addEventListener('change', () => deps.onSave({ keepHistory: keepHistory.checked }));
  const historyControls = el('div', { className: 'history-option' }, keepHistory);
  if (deps.onOpenHistory) {
    const open = el('button', { type: 'button', name: 'open-history', textContent: t('ui_history') });
    open.addEventListener('click', () => deps.onOpenHistory!());
    historyControls.append(open);
  }

  const statusChecks: Promise<void>[] = [];
  const providerSections = PROVIDERS.map(({ id, label }) => {
    const modelSelect = el('select', { name: `model-${id}`, id: `model-${id}` });

    const base = () => deps.baseModels?.(id) ?? settings.modelLists[id];
    const fillModels = () => {
      const list = [...new Set([...base(), ...settings.extraModels[id]])];
      const labels = settings.modelLabels?.[id] ?? {};
      modelSelect.replaceChildren(...list.map((m) => el('option', { value: m, textContent: labels[m] ?? m })));
      modelSelect.value = list.includes(settings.models[id]) ? settings.models[id] : (list[0] ?? '');
    };
    fillModels();
    const extra = el('textarea', { name: `extra-${id}`, id: `extra-${id}`, rows: 2, spellcheck: false });
    extra.value = settings.extraModels[id].join('\n');

    modelSelect.addEventListener('change', () => {
      settings = { ...settings, models: { ...settings.models, [id]: modelSelect.value } };
      deps.onSave({ models: settings.models });
    });
    extra.addEventListener('change', () => {
      const added = parseModelList(extra.value);
      extra.value = added.join('\n');
      const extraModels = { ...settings.extraModels, [id]: added };
      const list = [...new Set([...base(), ...added])];
      settings = { ...settings, extraModels, modelLists: { ...settings.modelLists, [id]: list } };
      const patch: Partial<Settings> = { extraModels };
      if (!list.includes(settings.models[id]) && list[0]) {
        settings = { ...settings, models: { ...settings.models, [id]: list[0] } };
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
      row(t('options_more_models'), extra),
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
      row(t('ui_style'), style),
      row(t('options_history'), historyControls),
    ),
    el(
      'fieldset',
      {},
      el('legend', { textContent: t('options_styles') }),
      el('p', { className: 'help', textContent: t('options_styles_help') }),
      styleList,
      addStyle,
    ),
    modelsInfo(),
    ...providerSections,
    el('p', { className: 'help', textContent: t('options_help') }),
  );
  function modelsInfo() {
    const checked = el('span', {});
    checked.dataset.role = 'models-checked';
    if (deps.modelsCheckedAt) {
      const date = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: 'medium', timeStyle: 'short' });
      checked.textContent = t('options_models_checked').replace('{date}', date.format(deps.modelsCheckedAt));
    } else {
      checked.textContent = t('options_models_never');
    }
    const info = el('p', { className: 'models-info' }, checked, ' ', el('span', { textContent: t('options_models_auto') }));
    if (deps.onRefreshModels) {
      const refresh = el('button', { name: 'refresh-models', type: 'button', textContent: t('options_models_refresh') });
      refresh.addEventListener('click', () => {
        refresh.disabled = true;
        void deps.onRefreshModels!().finally(() => (refresh.disabled = false));
      });
      info.append(' ', refresh);
    }
    return info;
  }

  if (deps.version) root.append(el('p', { className: 'version', textContent: `v${deps.version}` }));

  return { ready: Promise.all(statusChecks).then(() => undefined) };
}
