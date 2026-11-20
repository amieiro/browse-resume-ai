import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setMessages } from '@/lib/i18n';
import { defaultSettings, type ProviderId, type Settings } from '@/lib/settings';
import { mountOptionsView, parseModelList } from '@/ui/options-view';
import type { Availability } from '@/providers/types';

let root: HTMLElement;
let onSave: Mock<(patch: Partial<Settings>) => void>;
let availability: Record<string, Availability>;

const field = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[name="${name}"]`)!;
const change = (el: HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'change') => {
  el.value = value;
  el.dispatchEvent(new Event(event));
};

async function mount(
  settings: Settings = defaultSettings('en'),
  extra: { base?: Partial<Record<ProviderId, string[]>>; checkedAt?: number | null; onRefreshModels?: () => Promise<void> } = {},
) {
  const view = mountOptionsView(root, settings, {
    onSave,
    checkAvailability: async (id) => availability[id]!,
    baseModels: (id) => extra.base?.[id] ?? settings.modelLists[id],
    modelsCheckedAt: extra.checkedAt ?? null,
    onRefreshModels: extra.onRefreshModels ?? (async () => {}),
  });
  await view.ready;
  return view;
}

beforeEach(() => {
  fakeBrowser.reset();
  // Show the message key so tests can see which message is shown.
  setMessages(new Proxy({}, { get: (_t, key) => `[${String(key)}]` }));
  root = document.createElement('div');
  onSave = vi.fn<(patch: Partial<Settings>) => void>();
  availability = { claude: { ok: true }, codex: { ok: true }, ollama: { ok: true } };
});

describe('version', () => {
  it('shows the extension version when given', async () => {
    const view = mountOptionsView(root, defaultSettings('en'), {
      onSave,
      checkAvailability: async (id) => availability[id]!,
      version: '1.2.3',
    });
    await view.ready;
    expect(root.querySelector('.version')?.textContent).toBe('v1.2.3');
  });
});

describe('parseModelList', () => {
  it('trims, drops blanks and duplicates', () => {
    expect(parseModelList(' sonnet \n\nopus\nsonnet\n  \n')).toEqual(['sonnet', 'opus']);
  });
});

describe('options view', () => {
  it('offers automatic plus every language for the interface', async () => {
    await mount();
    const options = [...field<HTMLSelectElement>('uiLanguage').options];
    expect(options[0]).toMatchObject({ value: 'auto', textContent: '[options_ui_language_auto]' });
    expect(options.length).toBe(202);
  });

  it('shows the settings', async () => {
    await mount({ ...defaultSettings('en'), displayMode: 'popup', length: 'long', language: 'gl-ES', uiLanguage: 'fr-FR' });
    expect(field<HTMLSelectElement>('displayMode').value).toBe('popup');
    expect(field<HTMLSelectElement>('provider').value).toBe('claude');
    expect(field<HTMLSelectElement>('length').value).toBe('long');
    expect(field<HTMLSelectElement>('language').value).toBe('gl-ES');
    expect(field<HTMLSelectElement>('uiLanguage').value).toBe('fr-FR');
    expect(field<HTMLTextAreaElement>('extra-claude').value).toBe('');
    expect(field<HTMLSelectElement>('model-claude').value).toBe('sonnet');
  });

  it.each([
    ['displayMode', 'popup', { displayMode: 'popup' }],
    ['provider', 'codex', { provider: 'codex' }],
    ['length', 'short', { length: 'short' }],
    ['language', 'es-ES', { language: 'es-ES' }],
    ['uiLanguage', 'gl-ES', { uiLanguage: 'gl-ES' }],
    ['uiLanguage', 'auto', { uiLanguage: 'auto' }],
  ])('saves %s', async (name, value, patch) => {
    await mount();
    change(field<HTMLSelectElement>(name), value);
    expect(onSave).toHaveBeenLastCalledWith(patch as Partial<Settings>);
  });

  it('saves the selected model of a provider', async () => {
    await mount();
    change(field<HTMLSelectElement>('model-claude'), 'opus');
    expect(onSave).toHaveBeenLastCalledWith({ models: { claude: 'opus', codex: 'gpt-6.2-sol', ollama: '' } });
  });

  it('lists the detected models, then the ones added by hand', async () => {
    const settings = { ...defaultSettings('en'), extraModels: { claude: ['claude-x'], codex: [], ollama: [] } };
    await mount(settings, { base: { claude: ['sonnet', 'claude-opus-5-5'] } });
    expect([...field<HTMLSelectElement>('model-claude').options].map((o) => o.value)).toEqual(['sonnet', 'claude-opus-5-5', 'claude-x']);
    expect(field<HTMLTextAreaElement>('extra-claude').value).toBe('claude-x');
  });

  it('saves models added by hand and offers them', async () => {
    await mount(defaultSettings('en'), { base: { claude: ['sonnet', 'opus'] } });
    change(field<HTMLTextAreaElement>('extra-claude'), ' claude-x \n\nsonnet\nclaude-x');
    expect(onSave).toHaveBeenLastCalledWith({ extraModels: { claude: ['claude-x', 'sonnet'], codex: [], ollama: [] } });
    expect([...field<HTMLSelectElement>('model-claude').options].map((o) => o.value)).toEqual(['sonnet', 'opus', 'claude-x']);
  });

  it('moves the selection to the first model when the selected extra one is removed', async () => {
    const settings = {
      ...defaultSettings('en'),
      models: { claude: 'claude-x', codex: 'gpt-6.2-sol', ollama: '' },
      extraModels: { claude: ['claude-x'], codex: [], ollama: [] },
    };
    await mount(settings, { base: { claude: ['sonnet', 'opus'] } });
    change(field<HTMLTextAreaElement>('extra-claude'), '');
    expect(onSave).toHaveBeenLastCalledWith({
      extraModels: { claude: [], codex: [], ollama: [] },
      models: { claude: 'sonnet', codex: 'gpt-6.2-sol', ollama: '' },
    });
  });

  it('says when the lists were read, and reads them again on request', async () => {
    const onRefreshModels = vi.fn(async () => {});
    await mount(defaultSettings('en'), { checkedAt: Date.UTC(2026, 10, 20, 9, 30), onRefreshModels });
    expect(root.querySelector('[data-role="models-checked"]')?.textContent).toContain('[options_models_checked]'.replace('{date}', ''));
    root.querySelector<HTMLButtonElement>('button[name="refresh-models"]')!.click();
    expect(onRefreshModels).toHaveBeenCalled();
  });

  it('says when the lists were never read', async () => {
    await mount(defaultSettings('en'), { checkedAt: null });
    expect(root.querySelector('[data-role="models-checked"]')?.textContent).toBe('[options_models_never]');
  });

  it('shows Ready for an available provider', async () => {
    await mount();
    expect(root.querySelector('[data-status="claude"]')?.textContent).toBe('[options_ready]');
  });

  it.each(['host_missing', 'claude_missing', 'claude_auth'] as const)('shows the %s message', async (code) => {
    availability.claude = { ok: false, code };
    await mount();
    expect(root.querySelector('[data-status="claude"]')?.textContent).toBe(`[error_${code}]`);
  });

  it('shows the codex_missing message', async () => {
    availability.codex = { ok: false, code: 'codex_missing' };
    await mount();
    expect(root.querySelector('[data-status="codex"]')?.textContent).toBe('[error_codex_missing]');
  });
});
