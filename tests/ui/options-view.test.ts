import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defaultSettings, type Settings } from '@/lib/settings';
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

async function mount(settings: Settings = defaultSettings('en')) {
  const view = mountOptionsView(root, settings, {
    onSave,
    checkAvailability: async (id) => availability[id]!,
  });
  await view.ready;
  return view;
}

beforeEach(() => {
  fakeBrowser.reset();
  (fakeBrowser.i18n as any).getMessage = (key: string) => `[${key}]`;
  root = document.createElement('div');
  onSave = vi.fn<(patch: Partial<Settings>) => void>();
  availability = { claude: { ok: true }, codex: { ok: true } };
});

describe('parseModelList', () => {
  it('trims, drops blanks and duplicates', () => {
    expect(parseModelList(' sonnet \n\nopus\nsonnet\n  \n')).toEqual(['sonnet', 'opus']);
  });
});

describe('options view', () => {
  it('shows the settings', async () => {
    await mount({ ...defaultSettings('en'), displayMode: 'popup', length: 'long', language: 'gl' });
    expect(field<HTMLSelectElement>('displayMode').value).toBe('popup');
    expect(field<HTMLSelectElement>('provider').value).toBe('claude');
    expect(field<HTMLSelectElement>('length').value).toBe('long');
    expect(field<HTMLSelectElement>('language').value).toBe('gl');
    expect(field<HTMLTextAreaElement>('models-claude').value).toBe('sonnet\nopus\nhaiku\nfable');
    expect(field<HTMLSelectElement>('model-claude').value).toBe('sonnet');
  });

  it.each([
    ['displayMode', 'popup', { displayMode: 'popup' }],
    ['provider', 'codex', { provider: 'codex' }],
    ['length', 'short', { length: 'short' }],
    ['language', 'es', { language: 'es' }],
  ])('saves %s', async (name, value, patch) => {
    await mount();
    change(field<HTMLSelectElement>(name), value);
    expect(onSave).toHaveBeenLastCalledWith(patch as Partial<Settings>);
  });

  it('saves the selected model of a provider', async () => {
    await mount();
    change(field<HTMLSelectElement>('model-claude'), 'opus');
    expect(onSave).toHaveBeenLastCalledWith({ models: { claude: 'opus', codex: 'gpt-6.2-sol' } });
  });

  it('saves an edited model list', async () => {
    await mount();
    change(field<HTMLTextAreaElement>('models-claude'), 'sonnet\n opus \nsonnet\nclaude-x');
    expect(onSave).toHaveBeenLastCalledWith({
      modelLists: { claude: ['sonnet', 'opus', 'claude-x'], codex: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'] },
    });
  });

  it('selects the first model when the selected one is removed', async () => {
    await mount();
    change(field<HTMLTextAreaElement>('models-claude'), 'opus\nhaiku');
    expect(onSave).toHaveBeenLastCalledWith({
      modelLists: { claude: ['opus', 'haiku'], codex: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'] },
      models: { claude: 'opus', codex: 'gpt-6.2-sol' },
    });
    expect(field<HTMLSelectElement>('model-claude').value).toBe('opus');
  });

  it('rejects an empty list and restores the previous one', async () => {
    await mount();
    change(field<HTMLTextAreaElement>('models-claude'), ' \n ');
    expect(onSave).not.toHaveBeenCalled();
    expect(field<HTMLTextAreaElement>('models-claude').value).toBe('sonnet\nopus\nhaiku\nfable');
    expect(root.textContent).toContain('[options_models_empty]');
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
