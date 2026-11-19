import { browser } from 'wxt/browser';
import { isLanguageCode, type LanguageCode } from './languages';

export type ProviderId = 'claude' | 'codex';
export type SummaryLength = 'short' | 'medium' | 'long';
export type DisplayMode = 'sidepanel' | 'popup';

export interface Settings {
  displayMode: DisplayMode;
  provider: ProviderId;
  length: SummaryLength;
  language: LanguageCode;
  /** Selected model per provider. */
  models: Record<ProviderId, string>;
  /** User-editable model list per provider. */
  modelLists: Record<ProviderId, string[]>;
}

const STORAGE_KEY = 'settings';

export function defaultSettings(uiLanguage: string): Settings {
  const base = uiLanguage.toLowerCase().split(/[-_]/)[0] ?? '';
  return {
    displayMode: 'sidepanel',
    provider: 'claude',
    length: 'medium',
    language: isLanguageCode(base) ? base : 'en',
    models: { claude: 'sonnet', codex: 'gpt-6.2-sol' },
    modelLists: {
      claude: ['sonnet', 'opus', 'haiku', 'fable'],
      codex: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'],
    },
  };
}

function merge(defaults: Settings, stored: Partial<Settings> | undefined): Settings {
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    models: { ...defaults.models, ...stored.models },
    modelLists: { ...defaults.modelLists, ...stored.modelLists },
  };
}

export async function loadSettings(): Promise<Settings> {
  const defaults = defaultSettings(browser.i18n.getUILanguage());
  const result = await browser.storage.local.get(STORAGE_KEY);
  return merge(defaults, result[STORAGE_KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = merge(await loadSettings(), patch);
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
