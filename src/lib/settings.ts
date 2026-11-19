import { browser } from 'wxt/browser';
import { matchLanguage, type LanguageCode } from './languages';

export type ProviderId = 'claude' | 'codex';
export type SummaryLength = 'short' | 'medium' | 'long';
export type DisplayMode = 'sidepanel' | 'popup';

export interface Settings {
  displayMode: DisplayMode;
  provider: ProviderId;
  length: SummaryLength;
  language: LanguageCode;
  /** Interface language: 'auto' follows the browser. */
  uiLanguage: 'auto' | LanguageCode;
  /** Selected model per provider. */
  models: Record<ProviderId, string>;
  /** User-editable model list per provider. */
  modelLists: Record<ProviderId, string[]>;
}

const STORAGE_KEY = 'settings';

export function defaultSettings(uiLanguage: string): Settings {
  return {
    displayMode: 'sidepanel',
    provider: 'claude',
    length: 'medium',
    language: matchLanguage(uiLanguage) ?? 'en-US',
    uiLanguage: 'auto',
    models: { claude: 'sonnet', codex: 'gpt-6.2-sol' },
    modelLists: {
      claude: ['sonnet', 'opus', 'haiku', 'fable'],
      codex: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'],
    },
  };
}

function merge(defaults: Settings, stored: Partial<Settings> | undefined): Settings {
  if (!stored) return defaults;
  const merged = {
    ...defaults,
    ...stored,
    models: { ...defaults.models, ...stored.models },
    modelLists: { ...defaults.modelLists, ...stored.modelLists },
  };
  // Codes from older versions ("gl", "en") or no longer in the list are mapped or reset.
  merged.language = matchLanguage(merged.language) ?? defaults.language;
  if (merged.uiLanguage !== 'auto') merged.uiLanguage = matchLanguage(merged.uiLanguage) ?? 'auto';
  return merged;
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
