import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CATALOG_KEY } from '@/lib/model-catalog';
import { defaultSettings, loadSettings, loadStoredSettings, saveSettings } from '@/lib/settings';

describe('defaultSettings', () => {
  it('uses the browser language when it is in the list', () => {
    expect(defaultSettings('gl').language).toBe('gl-ES');
  });
  it('matches a regional browser language by its base code', () => {
    expect(defaultSettings('pt-BR').language).toBe('pt-BR');
  });
  it('falls back to English for other languages', () => {
    expect(defaultSettings('xx').language).toBe('en-US');
  });
  it('has the documented defaults', () => {
    const d = defaultSettings('en');
    expect(d).toMatchObject({ displayMode: 'sidepanel', provider: 'claude', length: 'medium', uiLanguage: 'auto' });
    expect(d.modelLists.claude).toEqual(['sonnet', 'opus', 'haiku', 'fable']);
    expect(d.models.claude).toBe('sonnet');
    expect(d.modelLists.codex).toEqual(['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna']);
    expect(d.models.codex).toBe('gpt-6.2-sol');
  });
});

describe('loadSettings / saveSettings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('gl');
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual({ ...defaultSettings('gl'), modelLabels: {} });
  });

  it('saves a patch and keeps the other fields', async () => {
    await saveSettings({ length: 'long' });
    const s = await loadSettings();
    expect(s.length).toBe('long');
    expect(s.provider).toBe('claude');
  });

  it('fills fields missing from an older stored object', async () => {
    await fakeBrowser.storage.local.set({ settings: { length: 'short', models: { claude: 'opus' } } });
    const s = await loadSettings();
    expect(s.length).toBe('short');
    expect(s.models.claude).toBe('opus');
    expect(s.models.codex).toBe('gpt-6.2-sol');
    expect(s.modelLists.claude).toEqual(['sonnet', 'opus', 'haiku', 'fable']);
  });

  it('migrates a language code from an older version', async () => {
    await fakeBrowser.storage.local.set({ settings: { language: 'gl' } });
    expect((await loadSettings()).language).toBe('gl-ES');
    await fakeBrowser.storage.local.set({ settings: { language: 'en' } });
    expect((await loadSettings()).language).toBe('en-US');
  });

  it('falls back to the default for an unknown stored language', async () => {
    await fakeBrowser.storage.local.set({ settings: { language: 'xx', uiLanguage: 'yy' } });
    const s = await loadSettings();
    expect(s.language).toBe('gl-ES');
    expect(s.uiLanguage).toBe('auto');
  });
});

describe('detected models', () => {
  const catalog = (models: Record<string, string[]>) => ({
    [CATALOG_KEY]: { checkedAt: 1, versionsCheckedAt: 1, extensionVersion: '1', versions: { claude: null, codex: null }, models },
  });

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en');
  });

  it('uses the detected models, followed by the ones added by hand', async () => {
    await fakeBrowser.storage.local.set(catalog({ codex: ['gpt-6.2-sol', 'gpt-6.1-terra'] }));
    await saveSettings({ extraModels: { claude: [], codex: ['my-model', 'gpt-6.1-terra'], ollama: [] } });
    const s = await loadSettings();
    expect(s.modelLists.codex).toEqual(['gpt-6.2-sol', 'gpt-6.1-terra', 'my-model']);
    expect(s.modelLists.claude).toEqual(['sonnet', 'opus', 'haiku', 'fable']);
  });

  it('moves a selected model that is no longer offered to the first one', async () => {
    await saveSettings({ models: { claude: 'sonnet', codex: 'gpt-6-luna', ollama: 'llama3.2' } });
    await fakeBrowser.storage.local.set(catalog({ codex: ['gpt-7'], ollama: ['qwen3:4b'] }));
    const s = await loadSettings();
    expect(s.models).toEqual({ claude: 'sonnet', codex: 'gpt-7', ollama: 'qwen3:4b' });
  });

  it('never stores the detected lists in the settings', async () => {
    await fakeBrowser.storage.local.set(catalog({ codex: ['gpt-7'] }));
    await saveSettings({ length: 'long' });
    expect((await loadStoredSettings()).modelLists.codex).toEqual(['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna']);
  });

  it('offers no Ollama models until some are detected, whatever an older version stored', async () => {
    await fakeBrowser.storage.local.set({ settings: { modelLists: { ollama: ['llama3.2', 'qwen3'] }, models: { ollama: 'llama3.2' } } });
    let s = await loadSettings();
    expect(s.modelLists.ollama).toEqual([]);
    expect(s.models.ollama).toBe('');
    await fakeBrowser.storage.local.set(catalog({ ollama: ['qwen3:4b'] }));
    s = await loadSettings();
    expect(s.modelLists.ollama).toEqual(['qwen3:4b']);
    expect(s.models.ollama).toBe('qwen3:4b');
  });

  it('still offers Ollama models added by hand', async () => {
    await saveSettings({ extraModels: { claude: [], codex: [], ollama: ['my-model'] } });
    expect((await loadSettings()).modelLists.ollama).toEqual(['my-model']);
  });
});

