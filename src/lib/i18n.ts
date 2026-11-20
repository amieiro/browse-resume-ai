import { isRtl, matchLanguage, type LanguageCode } from './languages';

// The extension picks its interface language itself (a setting), so it cannot use chrome.i18n,
// which always follows the browser. Each locale is a separate chunk, loaded on demand.
type Messages = Record<string, string>;

const loaders = import.meta.glob<Messages>('../locales/*.json', { import: 'default' });
const FALLBACK = 'en-US';

let messages: Messages = {};
let fallback: Messages = {};

// The messages name the macOS/Linux installer; Windows has its own.
const UNIX_INSTALL = './native-host/install.sh';
const WINDOWS_INSTALL = 'powershell -ExecutionPolicy Bypass -File native-host\\install.ps1';
let windows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

// Some messages name the Chrome Web Store; in Firefox the store is Firefox Add-ons (both product
// names stay untranslated in every language).
let firefox = Boolean(import.meta.env.FIREFOX);

/** For tests: pretend to run (or not) in Firefox. */
export function setFirefox(value: boolean): void {
  firefox = value;
}

/** For tests: pretend to run (or not) on Windows. */
export function setWindows(value: boolean): void {
  windows = value;
}

async function load(code: LanguageCode): Promise<Messages | null> {
  const loader = loaders[`../locales/${code}.json`];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

/** For tests: replace the loaded messages. */
export function setMessages(current: Messages, english: Messages = {}): void {
  messages = current;
  fallback = english;
}

/** Loads the interface strings for a language and sets the document's lang and dir. */
export async function initI18n(code: LanguageCode): Promise<void> {
  const english = (await load(FALLBACK)) ?? {};
  setMessages(code === FALLBACK ? english : ((await load(code)) ?? {}), english);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
  }
}

/** The interface language to use for a setting ('auto' follows the browser). */
export function resolveUiLanguage(setting: 'auto' | LanguageCode, browserLanguage: string): LanguageCode {
  if (setting !== 'auto') return matchLanguage(setting) ?? FALLBACK;
  return matchLanguage(browserLanguage) ?? FALLBACK;
}

/** Localized UI string; falls back to English, then to the key so a gap is visible, not blank. */
export function t(key: string): string {
  let text = messages[key] || fallback[key] || key;
  if (firefox) text = text.split('Chrome Web Store').join('Firefox Add-ons');
  return windows ? text.split(UNIX_INSTALL).join(WINDOWS_INSTALL) : text;
}
