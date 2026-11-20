import { beforeEach, describe, expect, it } from 'vitest';
import { initI18n, resolveUiLanguage, setFirefox, setMessages, setWindows, t } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';

const FILES = import.meta.glob<Record<string, string>>('../../src/locales/*.json', { eager: true, import: 'default' });
const codeOf = (path: string) => path.replace(/^.*\/(.+)\.json$/, '$1');
const read = (code: string) => FILES[`../../src/locales/${code}.json`] ?? {};

describe('t', () => {
  beforeEach(() => setMessages({ a: 'A' }, { a: 'fallback A', b: 'B' }));

  it('uses the locale message, then the English one, then the key', () => {
    expect(t('a')).toBe('A');
    expect(t('b')).toBe('B');
    expect(t('missing')).toBe('missing');
  });
});

describe('install command on Windows', () => {
  beforeEach(() => setMessages({ e: 'Run: ./native-host/install.sh now.' }));

  it('is the shell script elsewhere', () => {
    setWindows(false);
    expect(t('e')).toBe('Run: ./native-host/install.sh now.');
  });

  it('is the PowerShell installer on Windows', () => {
    setWindows(true);
    expect(t('e')).toBe('Run: powershell -ExecutionPolicy Bypass -File native-host\\install.ps1 now.');
    setWindows(false);
  });
});

describe('store name in Firefox', () => {
  beforeEach(() => setMessages({ e: 'Browser pages and the Chrome Web Store are not supported.' }));

  it('names Firefox Add-ons instead of the Chrome Web Store', () => {
    setFirefox(true);
    expect(t('e')).toBe('Browser pages and the Firefox Add-ons are not supported.');
    setFirefox(false);
    expect(t('e')).toBe('Browser pages and the Chrome Web Store are not supported.');
  });
});

describe('initI18n', () => {
  it('loads the chosen locale', async () => {
    await initI18n('gl-ES');
    expect(t('ui_copy')).toBe('Copiar');
    expect(document.documentElement.lang).toBe('gl-ES');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('sets the direction for right-to-left languages', async () => {
    await initI18n('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('falls back to English for a locale without a file', async () => {
    await initI18n('xx-XX');
    expect(t('ui_copy')).toBe('Copy');
  });
});

describe('resolveUiLanguage', () => {
  it('follows the browser in auto mode', () => {
    expect(resolveUiLanguage('auto', 'gl')).toBe('gl-ES');
    expect(resolveUiLanguage('auto', 'xx')).toBe('en-US');
  });

  it('uses the chosen language otherwise', () => {
    expect(resolveUiLanguage('fr-FR', 'gl')).toBe('fr-FR');
  });
});

describe('locale files', () => {
  const english = read('en-US');
  const keys = Object.keys(english);

  it('exist for every language in the list', () => {
    const files = Object.keys(FILES).map(codeOf);
    expect(files.sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it.each(LANGUAGES.map((l) => l.code))('%s has every key, translated and non-empty', (code) => {
    const messages = read(code);
    expect(Object.keys(messages)).toEqual(keys);
    for (const key of keys) expect(messages[key]!.trim(), key).not.toBe('');
  });

  it.each(LANGUAGES.map((l) => l.code))('%s keeps commands untranslated', (code) => {
    const messages = read(code);
    for (const key of keys) {
      for (const literal of ['./native-host/install.sh', 'codex login', 'ollama pull llama3.2', 'ollama.com', 'chrome://extensions']) {
        if (english[key]!.includes(literal)) expect(messages[key], `${key}`).toContain(literal);
      }
    }
  });
});
