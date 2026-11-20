import { browser } from 'wxt/browser';
import { matchLanguage, type LanguageCode } from './languages';
import { getCatalog, type ModelCatalog } from './model-catalog';

export type ProviderId = 'claude' | 'codex' | 'ollama';
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
  /**
   * Models per provider. Stored, it is the fallback list for when the models could not be read from
   * the provider; loadSettings returns the effective list (the detected models plus extraModels).
   */
  modelLists: Record<ProviderId, string[]>;
  /** Models the user added by hand, shown after the detected ones. */
  extraModels: Record<ProviderId, string[]>;
}

const STORAGE_KEY = 'settings';

export function defaultSettings(uiLanguage: string): Settings {
  return {
    displayMode: 'sidepanel',
    provider: 'claude',
    length: 'medium',
    language: matchLanguage(uiLanguage) ?? 'en-US',
    uiLanguage: 'auto',
    models: { claude: 'sonnet', codex: 'gpt-6.2-sol', ollama: '' },
    modelLists: {
      claude: ['sonnet', 'opus', 'haiku', 'fable'],
      codex: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'],
      // Ollama has only the models downloaded on this computer: none until they are detected.
      ollama: [],
    },
    extraModels: { claude: [], codex: [], ollama: [] },
  };
}

function merge(defaults: Settings, stored: Partial<Settings> | undefined): Settings {
  if (!stored) return defaults;
  const merged = {
    ...defaults,
    ...stored,
    models: { ...defaults.models, ...stored.models },
    modelLists: { ...defaults.modelLists, ...stored.modelLists },
    extraModels: { ...defaults.extraModels, ...stored.extraModels },
  };
  // Codes from older versions ("gl", "en") or no longer in the list are mapped or reset.
  merged.language = matchLanguage(merged.language) ?? defaults.language;
  if (merged.uiLanguage !== 'auto') merged.uiLanguage = matchLanguage(merged.uiLanguage) ?? 'auto';
  return merged;
}

const PROVIDER_IDS: ProviderId[] = ['claude', 'codex', 'ollama'];

/** The detected models of a provider, or the stored fallback list when none were detected. */
export function baseModels(stored: Settings, catalog: ModelCatalog | null, id: ProviderId): string[] {
  const detected = catalog?.models[id];
  // A fallback list makes no sense for Ollama (and older versions stored one): only what was seen.
  if (id === 'ollama') return detected ?? [];
  return detected?.length ? detected : stored.modelLists[id];
}

/**
 * The settings as the extension uses them: each model list is the detected models plus the ones
 * added by hand, and a selected model that is no longer in its list moves to the first one.
 */
export function applyCatalog(stored: Settings, catalog: ModelCatalog | null): Settings {
  const modelLists = { ...stored.modelLists };
  const models = { ...stored.models };
  for (const id of PROVIDER_IDS) {
    const list = [...new Set([...baseModels(stored, catalog, id), ...stored.extraModels[id]])];
    modelLists[id] = list;
    if (!list.includes(models[id])) models[id] = list[0] ?? '';
  }
  return { ...stored, modelLists, models };
}

/** The settings as stored, without the detected models. */
export async function loadStoredSettings(): Promise<Settings> {
  const defaults = defaultSettings(browser.i18n.getUILanguage());
  const result = await browser.storage.local.get(STORAGE_KEY);
  return merge(defaults, result[STORAGE_KEY] as Partial<Settings> | undefined);
}

export async function loadSettings(): Promise<Settings> {
  const [stored, catalog] = await Promise.all([loadStoredSettings(), getCatalog()]);
  return applyCatalog(stored, catalog);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = merge(await loadStoredSettings(), patch);
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
