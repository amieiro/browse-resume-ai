import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { LANGUAGES } from '@/lib/languages';
import { defaultSettings, loadSettings, saveSettings } from '@/lib/settings';

describe('languages', () => {
  it('lists the fixed languages in order', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['gl', 'es', 'en', 'pt', 'fr', 'de', 'it', 'ca', 'eu']);
  });
});

describe('defaultSettings', () => {
  it('uses the browser language when it is in the list', () => {
    expect(defaultSettings('gl').language).toBe('gl');
  });
  it('matches a regional browser language by its base code', () => {
    expect(defaultSettings('pt-BR').language).toBe('pt');
  });
  it('falls back to English for other languages', () => {
    expect(defaultSettings('ja').language).toBe('en');
  });
  it('has the documented defaults', () => {
    const d = defaultSettings('en');
    expect(d).toMatchObject({ displayMode: 'sidepanel', provider: 'claude', length: 'medium' });
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
    expect(await loadSettings()).toEqual(defaultSettings('gl'));
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
});
