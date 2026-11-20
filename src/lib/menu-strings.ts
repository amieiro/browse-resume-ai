import { matchLanguage, type LanguageCode } from './languages';

// The context menu titles, for the background service worker. It cannot load the interface
// strings the way pages do (a service worker cannot import modules on demand), so these two
// strings of every locale are bundled into it; the rest of each locale file is left out.
type Table = Record<string, string | undefined>;
const SELECTION = import.meta.glob<string>('../locales/*.json', { import: 'menu_summarize_selection', eager: true }) as Table;
const PAGE = import.meta.glob<string>('../locales/*.json', { import: 'menu_summarize_page', eager: true }) as Table;
const FALLBACK = 'en-US';

const pick = (table: Table, code: LanguageCode) => table[`../locales/${code}.json`] || table[`../locales/${FALLBACK}.json`]!;

/** Menu titles in the interface language ('auto' follows the browser). */
export function menuTitles(setting: 'auto' | LanguageCode, browserLanguage: string): { selection: string; page: string } {
  const code = (setting === 'auto' ? matchLanguage(browserLanguage) : matchLanguage(setting)) ?? FALLBACK;
  return { selection: pick(SELECTION, code), page: pick(PAGE, code) };
}
